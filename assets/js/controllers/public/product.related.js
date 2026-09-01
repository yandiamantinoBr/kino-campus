/**
 * @file product.related.js
 * @description Sub-modulo de publicacoes relacionadas da pagina de produto (v11.31.0)
 * Extraido de product.controller.js. Registra window._KCProduct.related.
 *
 * Dependencias em runtime:
 *   - window._KCProduct  — namespace criado por product.controller.js
 *   - window.KCAPI       — getRelatedPosts
 *   - window.KCUtils     — escapeHtml, getModuleLabel, formatCurrencyBRL
 *
 * Carregado apos product.report.js em _product.html (defer).
 * Execucao: IIFE imediata -> window._KCProduct.related disponivel antes de DOMContentLoaded.
 */

(function () {
  'use strict';

  window._KCProduct = window._KCProduct || {};

  function esc(str) {
    return (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function')
      ? window.KCUtils.escapeHtml(str)
      : String(str || '');
  }

  function moduleLabel(key) {
    if (window.KCUtils && typeof window.KCUtils.getModuleLabel === 'function') return window.KCUtils.getModuleLabel(key);
    return String(key || '');
  }

  function formatCurrency(n) {
    if (window.KCUtils && typeof window.KCUtils.formatCurrencyBRL === 'function') return window.KCUtils.formatCurrencyBRL(n);
    try { return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch (_) { return String(n); }
  }

  function getPostAuthorId(post) {
    var raw = post && (post.autorId || post.authorId || post.author_id);
    return String(raw || '').trim() || null;
  }

  function isLegacyExamplePost(post) {
    if (!post || typeof post !== 'object') return false;
    return !!String(post.legacyId || post.legacy_id || '').trim();
  }

  function buildLegacyExampleBadgeHtml(label, extraClass) {
    var text = String(label || 'Exemplo').trim() || 'Exemplo';
    var className = ['kc-product-example-ribbon', extraClass || ''].filter(Boolean).join(' ');
    return '<span class="' + className + '" aria-label="' + esc(text) + '"><i class="fas fa-flask"></i><span>' + esc(text) + '</span></span>';
  }

  function getPostIdForMutation(post) {
    if (!post) return null;
    return post.uuid || post.id || null;
  }

  var relatedRequestToken = 0;

  function getRelatedReasonLabel(candidate, currentPost) {
    var explicitReason = String(candidate && candidate._kcRelatedReason || '').trim();
    if (explicitReason) return explicitReason;

    var currentAuthorId = getPostAuthorId(currentPost);
    var candidateAuthorId = getPostAuthorId(candidate);
    var currentModule = String(currentPost && (currentPost.modulo || currentPost.module) || '').trim().toLowerCase();
    var candidateModule = String(candidate && (candidate.modulo || candidate.module) || '').trim().toLowerCase();

    if (currentAuthorId && candidateAuthorId && currentAuthorId === candidateAuthorId && currentModule && currentModule === candidateModule) {
      return 'Mesmo autor neste módulo';
    }
    if (currentAuthorId && candidateAuthorId && currentAuthorId === candidateAuthorId) {
      return 'Outro anúncio do mesmo autor';
    }
    if (currentModule && candidateModule && currentModule === candidateModule) {
      return 'Relacionado neste módulo';
    }
    return 'Publicação relacionada';
  }

  function getRelatedImageHtml(post) {
    var images = Array.isArray(post && post.imagens) ? post.imagens : (Array.isArray(post && post.images) ? post.images : []);
    var title = String(post && (post.titulo || post.title) || '').trim();
    var descriptiveTitle = title.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9]/g, '').length >= 3;
    var context = String(moduleLabel(post && (post.modulo || post.module)) || 'comunidade UFG').trim();
    var imageAlt = descriptiveTitle
      ? 'Imagem da publicação relacionada: ' + title
      : 'Imagem de publicação relacionada em ' + context;
    var exampleBadge = isLegacyExamplePost(post) ? buildLegacyExampleBadgeHtml('Exemplo', 'kc-product-example-ribbon--related') : '';
    if (images.length) {
      // v12.3.0: candidatos para o handler delegado de erro (URLs externas
      // quebradas caem no próximo candidato e, por fim, no fallback emoji).
      var candidates = [];
      var meta = post && post.metadata && typeof post.metadata === 'object' ? post.metadata : {};
      var pool = images
        .concat([post && post.cover_url, post && post.coverUrl, post && post.image_url, post && post.imageUrl])
        .concat([meta.cover_url, meta.coverUrl, meta.image_url, meta.imageUrl]);
      ['gallery_image_urls', 'galleryImageUrls', 'image_urls', 'imageUrls'].forEach(function (key) {
        if (Array.isArray(meta[key])) pool = pool.concat(meta[key]);
      });
      var seen = {};
      pool.forEach(function (value) {
        var raw = String(value == null ? '' : value).trim();
        if (!raw || seen[raw]) return;
        if (!/^https?:\/\//i.test(raw) && !/^data:image\//i.test(raw) && raw.charAt(0) !== '/') return;
        if (raw.charAt(0) === '/' && raw.charAt(1) === '/') return;
        seen[raw] = true;
        if (candidates.length < 6) candidates.push(raw);
      });
      var src = candidates.length ? candidates[0] : esc(String(images[0]));
      var attrs = candidates.length
        ? ' data-kc-image-candidates="' + esc(JSON.stringify(candidates)) + '"'
          + ' data-kc-image-emoji="' + esc(String(post && post.emoji || '✨').trim() || '✨') + '"'
          + ' data-kc-image-fallback-class="kc-related-card__media--fallback"'
          + ' data-kc-image-emoji-class="kc-related-card__media-emoji"'
        : '';
      return '<div class="kc-related-card__media"' + attrs + '>' + exampleBadge + '<img src="' + esc(src) + '" alt="' + esc(imageAlt) + '" loading="lazy" decoding="async" /></div>';
    }

    var emoji = String(post && post.emoji || '✨').trim() || '✨';
    return '<div class="kc-related-card__media kc-related-card__media--fallback">' + exampleBadge + '<span aria-hidden="true">' + esc(emoji) + '</span></div>';
  }

  function getRelatedPriceLabel(post) {
    var price = post && (post.preco != null ? post.preco : post.price);
    if (price == null || price === '') return '';
    if (typeof price === 'number') return price === 0 ? 'Gratuito' : formatCurrency(price);
    var normalized = String(price).trim();
    return normalized || '';
  }

  function renderRelatedPosts(posts, currentPost) {
    var section = document.getElementById('relatedSection');
    var grid = document.getElementById('relatedGrid');
    if (!section || !grid) return;
    grid.setAttribute('aria-busy', 'false');

    var list = Array.isArray(posts) ? posts.filter(Boolean) : [];
    if (!list.length) {
      grid.innerHTML = '';
      section.style.display = 'none';
      return;
    }

    grid.innerHTML = list.map(function (item) {
      var postId = String((item && (item.uuid || item.id)) || '').trim();
      if (!postId) return '';

      var href = 'product.html?id=' + encodeURIComponent(postId);
      var title = String(item && (item.titulo || item.title) || 'Publicação').trim() || 'Publicação';
      var author = String(item && (item.authorName || item.autor || item.author) || 'Autor').trim() || 'Autor';
      var reason = getRelatedReasonLabel(item, currentPost);
      var priceLabel = getRelatedPriceLabel(item);
      var moduleText = moduleLabel(item && (item.modulo || item.module) || '');
      var categoryText = String(item && (item.categoriaLabel || item.categoria || item.categoryLabel || item.category) || '').trim();
      var metaParts = [
        moduleText ? '<span><i class="fas fa-layer-group"></i> ' + esc(moduleText) + '</span>' : '',
        categoryText ? '<span><i class="fas fa-tag"></i> ' + esc(categoryText) + '</span>' : '',
        priceLabel ? '<span><i class="fas fa-money-bill-wave"></i> ' + esc(priceLabel) + '</span>' : '',
      ].filter(Boolean).join('');

      return [
        '<a class="kc-related-card" href="' + href + '">',
        getRelatedImageHtml(item),
        '<div class="kc-related-card__body">',
        '<span class="kc-related-card__reason">' + esc(reason) + '</span>',
        '<h4 class="kc-related-card__title">' + esc(title) + '</h4>',
        '<div class="kc-related-card__author"><i class="fas fa-user"></i> ' + esc(author) + '</div>',
        metaParts ? '<div class="kc-related-card__meta">' + metaParts + '</div>' : '',
        '</div>',
        '</a>',
      ].join('');
    }).filter(Boolean).join('');

    section.style.display = 'block';
  }

  async function setRelated(post, viewerAuthenticated) {
    var section = document.getElementById('relatedSection');
    var grid = document.getElementById('relatedGrid');
    if (!section || !grid || !post || !window.KCAPI || typeof window.KCAPI.getRelatedPosts !== 'function') {
      if (section) section.style.display = 'none';
      if (grid) {
        grid.setAttribute('aria-busy', 'false');
        grid.innerHTML = '';
      }
      return;
    }

    var currentPostId = getPostIdForMutation(post);
    if (!currentPostId) {
      section.style.display = 'none';
      grid.setAttribute('aria-busy', 'false');
      grid.innerHTML = '';
      return;
    }

    var requestToken = ++relatedRequestToken;
    grid.setAttribute('aria-busy', 'true');
    grid.innerHTML = '<div class="kc-related-loading" role="status"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Carregando publicações relacionadas...</div>';
    section.style.display = 'block';

    try {
      var items = await window.KCAPI.getRelatedPosts(currentPostId, {
        limit: 8,
        module: post.modulo || post.module || '',
        authorId: getPostAuthorId(post),
        currentPost: post,
        viewerAuthenticated: !!viewerAuthenticated,
      });
      if (requestToken !== relatedRequestToken) return;
      renderRelatedPosts(items, post);
    } catch (error) {
      if (requestToken !== relatedRequestToken) return;
      console.warn('[KC Product] related posts:', error);
      grid.setAttribute('aria-busy', 'false');
      grid.innerHTML = '';
      section.style.display = 'none';
    }
  }

  window._KCProduct.related = {
    setRelated: setRelated,
  };
})();
