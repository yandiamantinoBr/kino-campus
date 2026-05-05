/**
 * KinoCampus — product.render.js v13.4.1
 *
 * Sub-módulo de renderização pura para a página de produto (_product.html).
 * Extraído de product.controller.js (v13.4.1 split).
 *
 * Contém:
 *   - Utilitários DOM (esc, setText, setHTML, show, hide, formatCurrency, moduleLabel)
 *   - Funções de renderização de dados do post (showNotFound, setBreadcrumb, setBadges,
 *     setGallery, setPrice, setDescription, setSpecs, setOpenGraphTags, setLegacyBanner,
 *     buildTagEntries, buildTagsSpecHtml, getPostAuthorId, legacy markers)
 *
 * Expõe: window._KCProduct.render (Object.freeze)
 * Carregado: após product.controller.js, antes de product.load.js
 * Dependências: window.KCUtils (opcional, com fallbacks)
 */

(function () {
  'use strict';

  window._KCProduct = window._KCProduct || {};

  // ── Utilitários DOM ──────────────────────────────────────────────────────────

  function esc(str) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') return window.KCUtils.escapeHtml(str);
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setHTML(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html || '';
  }

  function show(id, display) {
    var el = document.getElementById(id);
    if (el) el.style.display = display || '';
  }

  function hide(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  function moduleLabel(key) {
    if (window.KCUtils && typeof window.KCUtils.getModuleLabel === 'function') return window.KCUtils.getModuleLabel(key);
    return String(key || '');
  }

  function closedLabel(post) {
    var moduleKey = String(post && (post.modulo || post.module) || '').trim().toLowerCase();
    if (moduleKey === 'eventos') return 'Evento encerrado';
    if (moduleKey === 'caronas') return 'Carona encerrada';
    if (moduleKey === 'compra-venda') return 'Anuncio encerrado';
    return 'Publicacao encerrada';
  }

  function syncClosedStatusNote(post, isClosed) {
    var current = document.getElementById('kcClosedStatusNote');
    if (current) current.remove();
    if (!isClosed) return;
    var details = document.querySelector('.kc-product-details');
    if (!details) return;
    var note = document.createElement('div');
    note.id = 'kcClosedStatusNote';
    note.className = 'kc-product-status-note kc-product-status-note--closed';
    note.innerHTML = '<i class="fas fa-lock" aria-hidden="true"></i><span><strong>' + esc(closedLabel(post)) + '.</strong> Esta publicacao fica visivel como historico, mas nao esta mais ativa.</span>';
    details.insertAdjacentElement('afterbegin', note);
  }

  function formatCurrency(n) {
    if (window.KCUtils && typeof window.KCUtils.formatCurrencyBRL === 'function') return window.KCUtils.formatCurrencyBRL(n);
    try { return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch (_) { return String(n); }
  }

  // ── Helpers de identificação ─────────────────────────────────────────────────

  function getPostAuthorId(post) {
    var raw = post && (post.autorId || post.authorId || post.author_id);
    return String(raw || '').trim() || null;
  }

  // ── Legacy example markers ───────────────────────────────────────────────────

  function isLegacyExamplePost(post) {
    if (!post || typeof post !== 'object') return false;
    return !!String(post.legacyId || post.legacy_id || '').trim();
  }

  function isLegacyExampleProfile(profile) {
    if (!profile || typeof profile !== 'object') return false;
    return !!String(profile.legacyId || profile.legacy_id || '').trim();
  }

  function buildLegacyExampleBadgeHtml(label, extraClass) {
    var text = String(label || 'Exemplo').trim() || 'Exemplo';
    var className = ['kc-product-example-ribbon', extraClass || ''].filter(Boolean).join(' ');
    return '<span class="' + className + '" aria-label="' + esc(text) + '"><i class="fas fa-flask"></i><span>' + esc(text) + '</span></span>';
  }

  function syncLegacyExampleMarker(container, shouldShow, label, extraClass) {
    if (!container) return;
    var current = container.querySelector('.kc-product-example-ribbon');
    if (current) current.remove();
    if (!shouldShow) return;
    container.insertAdjacentHTML('afterbegin', buildLegacyExampleBadgeHtml(label, extraClass));
  }

  // ── Not found ────────────────────────────────────────────────────────────────

  function showNotFound() {
    show('notFound', 'block');
    hide('relatedSection');
    hide('sellerCard');
    setText('postTitle', 'Anúncio não encontrado ou removido');
    setHTML('postDescription', '');
    setHTML('badges', '');
    hide('priceBlock');
    hide('specsBlock');
    var emojiCover = document.getElementById('emojiCover');
    if (emojiCover) { emojiCover.textContent = '❓'; emojiCover.style.display = 'flex'; }
    hide('mainImage');
    hide('thumbnails');
  }

  // ── setBreadcrumb ────────────────────────────────────────────────────────────

  function setBreadcrumb(post) {
    var bc = document.getElementById('breadcrumb');
    if (!bc) return;
    var modKey = String(post.modulo || '');
    var modLbl = moduleLabel(modKey);
    var catLbl = post.categoriaLabel || post.categoria || '';
    var subLbl = post.subcategoriaLabel || post.subcategoria || '';
    var parts = [];
    parts.push('<a href="index.html"><i class="fas fa-home"></i> KinoCampus</a>');
    var rawModulePage = String((post._kcModulePage || '') || 'index.html').trim();
    var safeModulePage = /^[a-z0-9_-]+\.html(?:[?#].*)?$/i.test(rawModulePage) ? rawModulePage : 'index.html';
    if (modKey) parts.push('<i class="fas fa-chevron-right"></i><a href="' + esc(safeModulePage) + '">' + esc(modLbl) + '</a>');
    parts.push('<i class="fas fa-chevron-right"></i><span>' + esc(catLbl || 'Detalhes') + '</span>');
    if (subLbl) parts.push('<i class="fas fa-chevron-right"></i><span>' + esc(subLbl) + '</span>');
    bc.innerHTML = parts.join(' ');
  }

  // ── setBadges ────────────────────────────────────────────────────────────────

  function setBadges(post) {
    var el = document.getElementById('badges');
    if (!el) return;
    var badges = [];
    var isClosed = String(post && (post.status || post.estado) || '').trim().toLowerCase() === 'closed' || post.isClosed === true;
    syncClosedStatusNote(post, isClosed);
    if (post.modulo) {
      var icon = (window.KCUtils && typeof window.KCUtils.getModuleIconClass === 'function')
        ? window.KCUtils.getModuleIconClass(post.modulo)
        : 'fas fa-layer-group';
      badges.push('<span class="kc-badge"><i class="' + esc(icon) + '"></i> ' + esc(moduleLabel(post.modulo)) + '</span>');
    }
    if (isClosed) badges.push('<span class="kc-badge kc-badge--closed"><i class="fas fa-lock" aria-hidden="true"></i> Encerrado</span>');
    if (post._kcStatusBadgeHtml) badges.push(post._kcStatusBadgeHtml);
    if (post.verificado) badges.push(post._kcVerifiedTag || '<span class="kc-badge kc-badge--verified"><i class="fas fa-check-circle"></i> Verificado</span>');
    if (post.condicao) badges.push('<span class="kc-badge"><i class="fas fa-star"></i> ' + esc(post.condicao) + '</span>');
    var relTime = post._kcRelativeTime || (window.KCUtils && window.KCUtils.timeAgo ? window.KCUtils.timeAgo(post.timestamp || post.created_at) : (post.timestamp || post.created_at));
    if (relTime) badges.push('<span class="kc-badge"><i class="fas fa-clock"></i> ' + esc(relTime) + '</span>');
    el.innerHTML = badges.join(' ');
  }

  // ── setGallery ───────────────────────────────────────────────────────────────

  function setGallery(post) {
    var mainImg = document.getElementById('mainImage');
    var emojiCover = document.getElementById('emojiCover');
    var thumbs = document.getElementById('thumbnails');
    var galleryMain = document.querySelector('.kc-gallery-main');
    var images = Array.isArray(post.imagens) ? post.imagens : (Array.isArray(post.images) ? post.images : []);
    var isLegacy = isLegacyExamplePost(post);
    syncLegacyExampleMarker(galleryMain, isLegacy, 'Exemplo', 'kc-product-example-ribbon--gallery');
    var emoji = post.emoji || '✨';
    if (images && images.length) {
      if (mainImg) { mainImg.src = images[0]; mainImg.style.display = 'block'; }
      if (emojiCover) emojiCover.style.display = 'none';
      if (thumbs) {
        thumbs.innerHTML = '';
        images.forEach(function (src, idx) {
          var img = document.createElement('img');
          img.src = src;
          img.alt = 'Miniatura ' + (idx + 1);
          img.loading = 'lazy';
          img.decoding = 'async';
          img.className = 'kc-thumbnail' + (idx === 0 ? ' active' : '');
          img.setAttribute('data-full-src', src);
          img.addEventListener('click', function () {
            var all = thumbs.querySelectorAll('.kc-thumbnail');
            all.forEach(function (t) { t.classList.remove('active'); });
            img.classList.add('active');
            if (mainImg) mainImg.src = src;
          });
          thumbs.appendChild(img);
        });
        thumbs.style.display = images.length > 1 ? 'flex' : 'none';
      }
    } else {
      if (mainImg) mainImg.style.display = 'none';
      if (emojiCover) { emojiCover.style.display = 'flex'; emojiCover.textContent = emoji; }
      if (thumbs) thumbs.style.display = 'none';
    }
  }

  // ── setPrice ─────────────────────────────────────────────────────────────────

  function setPrice(post) {
    var block = document.getElementById('priceBlock');
    if (!block) return;
    if (post._kcHidePrice) { block.style.display = 'none'; return; }
    var iconEl = document.getElementById('priceIcon');
    var valueEl = document.getElementById('priceValue');
    var smallEl = document.getElementById('priceSmall');
    var origEl = document.getElementById('priceOriginal');
    var discEl = document.getElementById('priceDiscount');
    var iconClass = post._kcPriceIconClass || 'fas fa-money-bill-wave';
    if (iconEl) iconEl.className = iconClass;
    var main = post._kcPriceTextMain || (typeof post.preco === 'number' ? (post.preco === 0 ? 'Gratuito' : formatCurrency(post.preco)) : '');
    var small = post._kcPriceTextSmall || '';
    if (valueEl) valueEl.textContent = main;
    if (smallEl) smallEl.textContent = small;
    var showOriginal = !!post._kcShowOriginalPrice;
    var showDiscount = !!post._kcShowDiscount;
    if (origEl) {
      if (showOriginal && typeof post.precoOriginal === 'number') { origEl.textContent = formatCurrency(post.precoOriginal); origEl.style.display = ''; }
      else origEl.style.display = 'none';
    }
    if (discEl) {
      if (showDiscount && typeof post.descontoPercentual === 'number') { discEl.textContent = '-' + String(post.descontoPercentual) + '%'; discEl.style.display = ''; }
      else discEl.style.display = 'none';
    }
    if (post._kcPriceStyle && typeof post._kcPriceStyle === 'object') {
      try { Object.entries(post._kcPriceStyle).forEach(function (kv) { block.style.setProperty(kv[0], kv[1]); }); } catch (_) {}
    }
    block.style.display = 'flex';
  }

  // ── buildTagEntries, buildTagsSpecHtml ───────────────────────────────────────

  function buildTagEntries(post) {
    var tags = Array.isArray(post.tags) ? post.tags.slice(0, 14) : [];
    var markerTags = (window.KCUtils && typeof window.KCUtils.getDisplayMarkerTags === 'function')
      ? window.KCUtils.getDisplayMarkerTags(post, { limit: 14 }) : [];
    var normalize = (window.KCUtils && typeof window.KCUtils.normalizeText === 'function')
      ? window.KCUtils.normalizeText : function (v) { return String(v || '').toLowerCase().trim(); };
    var markerLabels = new Set(markerTags.map(function (tag) { return normalize(tag && tag.label); }));
    var plainTags = tags.filter(function (tag) { return !markerLabels.has(normalize(tag)); })
      .map(function (tag) { return { label: tag, emoji: '🏷️' }; });
    return { markerTags: markerTags, plainTags: plainTags };
  }

  function buildTagsSpecHtml(post) {
    var entries = buildTagEntries(post);
    if (!entries.markerTags.length && !entries.plainTags.length) return '';
    function renderTag(tag, itemClass) {
      var emoji = esc(String(tag && tag.emoji || '🏷️').trim());
      var label = esc(String(tag && tag.label || '').trim());
      return '<span class="' + itemClass + '">' + (emoji ? '<span class="kc-tag__emoji">' + emoji + '</span>' : '') + '<span>' + label + '</span></span>';
    }
    return '<div class="kc-tags-list kc-tags-list--specs">'
      + entries.markerTags.map(function (t) { return renderTag(t, 'kc-tag kc-tag--marker'); }).join('')
      + entries.plainTags.map(function (t) { return renderTag(t, 'kc-tag'); }).join('')
      + '</div>';
  }

  // ── setOpenGraphTags ─────────────────────────────────────────────────────────

  function setOpenGraphTags(post) {
    var title = (post.titulo || post.title || 'KinoCampus') + ' — KinoCampus';
    var desc = String(post.descricao || post.description || 'Anúncios, eventos e oportunidades da comunidade universitária UFG.').trim().substring(0, 200);
    var images = post.images || post.image_urls || [];
    var img = images.length ? String(images[0]) : '';
    var url = window.location.href;
    function setMeta(selector, attr, value) {
      var el = document.querySelector(selector);
      if (el && value) el.setAttribute(attr, value);
    }
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', desc);
    setMeta('meta[property="og:image"]', 'content', img);
    setMeta('meta[property="og:url"]', 'content', url);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', desc);
    setMeta('meta[name="twitter:image"]', 'content', img);
  }

  // ── setLegacyBanner ──────────────────────────────────────────────────────────

  function setLegacyBanner(post) {
    var el = document.getElementById('legacyNotice');
    if (!el) return;
    if (isLegacyExamplePost(post)) {
      el.innerHTML = '<div class="kc-legacy-banner"><span class="kc-legacy-banner__icon"><i class="fas fa-flask"></i></span><div><strong>Publicação de exemplo</strong>Este é um post fictício criado para demonstração da plataforma. Não representa um anúncio real.</div></div>';
      el.style.display = '';
    } else {
      el.style.display = 'none';
      el.innerHTML = '';
    }
  }

  // ── setDescription (versão canônica — v2 sobrepõe v1) ───────────────────────

  function setDescription(post) {
    var rawDesc = post.descricao || post.description || '';
    var renderMd = (window.KCUtils && typeof window.KCUtils.renderMarkdownInline === 'function')
      ? window.KCUtils.renderMarkdownInline : esc;
    var descHtml = renderMd(rawDesc);
    var html = '';
    if (descHtml) {
      html += '<h3><i class="fas fa-align-left"></i> Descrição</h3><div class="kc-description-content">' + descHtml + '</div>';
    }
    setHTML('postDescription', html);
  }

  // ── addSpec / addSpecHtml (versão canônica — v2) ─────────────────────────────

  function addSpec(grid, iconClass, label, value) {
    var item = document.createElement('div');
    item.className = 'kc-spec-item';
    item.innerHTML = '<i class="' + esc(iconClass) + '"></i><div class="kc-spec-item__body"><strong>' + esc(label) + '</strong><span>' + esc(value) + '</span></div>';
    grid.appendChild(item);
  }

  function addSpecHtml(grid, iconClass, label, html) {
    var item = document.createElement('div');
    item.className = 'kc-spec-item';
    item.innerHTML = '<i class="' + esc(iconClass) + '"></i><div class="kc-spec-item__body"><strong>' + esc(label) + '</strong><div class="kc-spec-item__html">' + (html || '') + '</div></div>';
    grid.appendChild(item);
  }

  // ── setSpecs (versão canônica — v2) ──────────────────────────────────────────

  function setSpecs(post) {
    var block = document.getElementById('specsBlock');
    var grid = document.getElementById('specsGrid');
    if (!block || !grid) return;
    grid.innerHTML = '';
    var pairs = [];
    var tagsHtml = buildTagsSpecHtml(post);
    if (tagsHtml) addSpecHtml(grid, 'fas fa-hashtag', 'Tags', tagsHtml);
    if (post.modulo) pairs.push(['fas fa-layer-group', 'Módulo', moduleLabel(post.modulo)]);
    if (post.categoriaLabel || post.categoria) pairs.push(['fas fa-tag', 'Categoria', post.categoriaLabel || post.categoria]);
    if (post.subcategoriaLabel || post.subcategoria) pairs.push(['fas fa-hashtag', 'Subcategoria', post.subcategoriaLabel || post.subcategoria]);
    if (post.verificado != null) pairs.push(['fas fa-check-circle', 'Verificação', post.verificado ? 'Sim' : 'Não']);
    if (post.condicao) pairs.push(['fas fa-star', 'Condição', post.condicao]);
    if (!pairs.length && !tagsHtml) { block.style.display = 'none'; return; }
    pairs.forEach(function (pair) { addSpec(grid, pair[0], pair[1], pair[2]); });
    block.style.display = 'block';
  }

  // ── Namespace público ─────────────────────────────────────────────────────────

  window._KCProduct.render = Object.freeze({
    esc:                        esc,
    setText:                    setText,
    setHTML:                    setHTML,
    show:                       show,
    hide:                       hide,
    moduleLabel:                moduleLabel,
    formatCurrency:             formatCurrency,
    getPostAuthorId:            getPostAuthorId,
    isLegacyExamplePost:        isLegacyExamplePost,
    isLegacyExampleProfile:     isLegacyExampleProfile,
    buildLegacyExampleBadgeHtml: buildLegacyExampleBadgeHtml,
    syncLegacyExampleMarker:    syncLegacyExampleMarker,
    showNotFound:               showNotFound,
    setBreadcrumb:              setBreadcrumb,
    setBadges:                  setBadges,
    setGallery:                 setGallery,
    setPrice:                   setPrice,
    buildTagEntries:            buildTagEntries,
    buildTagsSpecHtml:          buildTagsSpecHtml,
    setOpenGraphTags:           setOpenGraphTags,
    setLegacyBanner:            setLegacyBanner,
    setDescription:             setDescription,
    addSpec:                    addSpec,
    addSpecHtml:                addSpecHtml,
    setSpecs:                   setSpecs,
  });

})();
