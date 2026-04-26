/**
 * @file product.ratings.js
 * @description Sub-modulo de avaliacoes do vendedor na pagina de produto (v11.30.14)
 * Extraido de product.controller.js. Registra window._KCProduct.ratings.
 *
 * Dependencias em runtime:
 *   - window._KCProduct  - namespace criado por product.controller.js
 *   - window.KCAPI       - upsertUserRating
 *   - window.KCUtils     - escapeHtml
 *   - window.showToast   - feedback visual
 *
 * Carregado apos product.save.js em _product.html (defer).
 * Execucao: IIFE imediata -> window._KCProduct.ratings disponivel antes de DOMContentLoaded.
 */
(function () {
  'use strict';
  window._KCProduct = window._KCProduct || {};
  var sellerRatingModal = null;
  function esc(str) {
    try {
      return window.KCUtils && typeof window.KCUtils.escapeHtml === 'function'
        ? window.KCUtils.escapeHtml(str)
        : String(str || '');
    } catch (_) {
      return String(str || '');
    }
  }
  function toast(message, type, duration) {
    try {
      if (typeof window.showToast === 'function') {
        window.showToast(message, type, duration);
      }
    } catch (_) { }
  }
  function buildCurrentPagePath() {
    var path = String(window.location.pathname || '/product.html').trim() || '/product.html';
    return '' + path + (window.location.search || '') + (window.location.hash || '');
  }
  function getPostAuthorId(post) {
    var raw = post && (post.autorId || post.authorId || post.author_id);
    return String(raw || '').trim() || null;
  }
  function getPostIdForMutation(post) {
    if (!post) return null;
    return post.uuid || post.id || null;
  }
  function isLegacyExamplePost(post) {
    if (!post || typeof post !== 'object') return false;
    return !!String(post.legacyId || post.legacy_id || '').trim();
  }
  function isLegacyExampleProfile(profile) {
    if (!profile || typeof profile !== 'object') return false;
    return !!String(profile.legacyId || profile.legacy_id || '').trim();
  }
  function normalizeSellerRatingSummary(raw) {
    var source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    var averageRaw = source.average != null ? source.average : (source.rating_avg != null ? source.rating_avg : source.rating);
    var average = (averageRaw != null && averageRaw !== '') ? Number(averageRaw) : null;
    var countRaw = source.count != null ? source.count : source.rating_count;
    var count = Math.max(0, parseInt(String(countRaw != null ? countRaw : 0), 10) || 0);
    return {
      userId: String(source.userId || source.user_id || '').trim() || null,
      average: Number.isFinite(average) ? Number(average.toFixed(2)) : null,
      count: count,
    };
  }
  function getSellerRatingSummaryFromPost(post) {
    var authorProfile = (post && post.authorProfile && typeof post.authorProfile === 'object') ? post.authorProfile : {};
    return normalizeSellerRatingSummary({
      userId: getPostAuthorId(post),
      average: authorProfile.ratingAvg != null ? authorProfile.ratingAvg : (authorProfile.rating_avg != null ? authorProfile.rating_avg : (post && post.rating)),
      count: authorProfile.ratingCount != null ? authorProfile.ratingCount : (authorProfile.rating_count != null ? authorProfile.rating_count : (post && (post.ratingCount != null ? post.ratingCount : post.rating_count))),
    });
  }
  function applySellerRatingSummaryToPost(post, summary) {
    if (!post || typeof post !== 'object') return post;
    var normalizedSummary = normalizeSellerRatingSummary(summary);
    var nextAuthorProfile = (post.authorProfile && typeof post.authorProfile === 'object')
      ? Object.assign({}, post.authorProfile)
      : {};
    nextAuthorProfile.rating_avg = normalizedSummary.average;
    nextAuthorProfile.rating_count = normalizedSummary.count;
    nextAuthorProfile.ratingAvg = normalizedSummary.average;
    nextAuthorProfile.ratingCount = normalizedSummary.count;
    post.authorProfile = nextAuthorProfile;
    post.rating = normalizedSummary.count > 0 ? normalizedSummary.average : null;
    post.ratingCount = normalizedSummary.count;
    post.rating_count = normalizedSummary.count;
    return post;
  }
  function buildSellerRatingSummaryHtml(summary) {
    var normalizedSummary = normalizeSellerRatingSummary(summary);
    if (!normalizedSummary.count || !Number.isFinite(normalizedSummary.average)) {
      return [
        '<div class="kc-seller-rating-summary__empty">',
        '<i class="fas fa-star-half-stroke"></i>',
        '<span>Ainda sem avalia\u00E7\u00F5es p\u00FAblicas.</span>',
        '</div>',
      ].join('');
    }
    var averageText = normalizedSummary.average.toFixed(1);
    var countLabel = normalizedSummary.count === 1 ? '1 avalia\u00E7\u00E3o' : normalizedSummary.count + ' avalia\u00E7\u00F5es';
    return [
      '<div class="kc-seller-rating-summary__top">',
      '<span class="kc-seller-rating-summary__value"><i class="fas fa-star"></i> ' + esc(averageText) + '</span>',
      '<span class="kc-seller-rating-summary__count">' + esc(countLabel) + '</span>',
      '</div>',
      '<div class="kc-seller-rating-summary__caption">Baseada nas intera\u00E7\u00F5es confirmadas da comunidade.</div>',
    ].join('');
  }
  function getUserRatingReasonMessage(reason) {
    var key = String(reason || '').trim().toUpperCase();
    if (key === 'SELF') return 'Voc\u00EA n\u00E3o pode avaliar o pr\u00F3prio perfil.';
    if (key === 'NO_INTERACTION') return 'Interaja com um post deste usu\u00E1rio antes de avali\u00E1-lo.';
    if (key === 'AUTH_REQUIRED') return 'Fa\u00E7a login para avaliar membros da comunidade.';
    return 'A avalia\u00E7\u00E3o n\u00E3o est\u00E1 dispon\u00EDvel neste contexto.';
  }
  function openAuthForUserRating() {
    if (typeof window.kcOpenAuthModal === 'function') {
      window.kcOpenAuthModal({ tab: 'login', nextPath: buildCurrentPagePath() });
      return;
    }
    window.location.href = 'index.html#login';
  }
  function ensureSellerRatingModal() {
    if (sellerRatingModal) return sellerRatingModal;
    var overlay = document.createElement('div');
    overlay.className = 'kc-modal-overlay';
    overlay.style.display = 'none';
    var modal = document.createElement('div');
    modal.className = 'kc-user-rating-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'kcSellerRatingModalTitle');
    modal.innerHTML = [
      '<div class="kc-user-rating-modal__header">',
      '<div>',
      '<h2 class="kc-user-rating-modal__title" id="kcSellerRatingModalTitle">Avaliar usu\u00E1rio</h2>',
      '<p class="kc-user-rating-modal__subtitle" id="kcSellerRatingModalSubtitle">Compartilhe como foi sua intera\u00E7\u00E3o com este membro.</p>',
      '</div>',
      '<button type="button" class="kc-user-rating-modal__close" aria-label="Fechar modal de avalia\u00E7\u00E3o"><i class="fas fa-times"></i></button>',
      '</div>',
      '<div class="kc-user-rating-modal__body">',
      '<div class="kc-user-rating-modal__section">',
      '<span class="kc-user-rating-modal__label">Sua nota</span>',
      '<div class="kc-user-rating-stars" role="radiogroup" aria-label="Selecione uma nota de 1 a 5 estrelas">',
      '<button type="button" class="kc-user-rating-star" data-kc-rating-value="1" aria-label="1 estrela"><i class="fas fa-star"></i></button>',
      '<button type="button" class="kc-user-rating-star" data-kc-rating-value="2" aria-label="2 estrelas"><i class="fas fa-star"></i></button>',
      '<button type="button" class="kc-user-rating-star" data-kc-rating-value="3" aria-label="3 estrelas"><i class="fas fa-star"></i></button>',
      '<button type="button" class="kc-user-rating-star" data-kc-rating-value="4" aria-label="4 estrelas"><i class="fas fa-star"></i></button>',
      '<button type="button" class="kc-user-rating-star" data-kc-rating-value="5" aria-label="5 estrelas"><i class="fas fa-star"></i></button>',
      '</div>',
      '</div>',
      '<div class="kc-user-rating-modal__section">',
      '<label class="kc-user-rating-modal__label" for="kcSellerRatingComment">Coment\u00E1rio opcional</label>',
      '<textarea id="kcSellerRatingComment" maxlength="280" placeholder="Conte, em poucas linhas, como foi sua experi\u00EAncia com este usu\u00E1rio."></textarea>',
      '<div class="kc-user-rating-modal__meta">',
      '<span>Seu coment\u00E1rio ser\u00E1 exibido na lista p\u00FAblica de avalia\u00E7\u00F5es.</span>',
      '<span id="kcSellerRatingCounter">0/280</span>',
      '</div>',
      '</div>',
      '<div class="kc-user-rating-modal__status" id="kcSellerRatingStatus" aria-live="polite"></div>',
      '<div class="kc-user-rating-modal__actions">',
      '<button type="button" class="kc-btn-secondary" data-action="cancel">Cancelar</button>',
      '<button type="button" class="kc-btn-primary" data-action="submit"><i class="fas fa-star"></i> Salvar avalia\u00E7\u00E3o</button>',
      '</div>',
      '</div>',
    ].join('');
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    var closeBtn = modal.querySelector('.kc-user-rating-modal__close');
    var cancelBtn = modal.querySelector('[data-action="cancel"]');
    var submitBtn = modal.querySelector('[data-action="submit"]');
    var subtitle = modal.querySelector('#kcSellerRatingModalSubtitle');
    var status = modal.querySelector('#kcSellerRatingStatus');
    var textarea = modal.querySelector('#kcSellerRatingComment');
    var counter = modal.querySelector('#kcSellerRatingCounter');
    var stars = Array.from(modal.querySelectorAll('.kc-user-rating-star'));
    var submitHandler = null;
    var selectedRating = 0;
    function setStatus(message, tone) {
      if (!status) return;
      status.textContent = String(message || '').trim();
      status.className = 'kc-user-rating-modal__status' + (tone ? ' is-' + tone : '');
    }
    function updateCounter() {
      if (!counter || !textarea) return;
      counter.textContent = String(Math.min(280, String(textarea.value || '').length)) + '/280';
    }
    function updateStars() {
      stars.forEach(function (button) {
        var value = parseInt(String(button.getAttribute('data-kc-rating-value') || '0'), 10) || 0;
        var active = value <= selectedRating;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-checked', active ? 'true' : 'false');
      });
    }
    function close() {
      overlay.classList.remove('active');
      window.setTimeout(function () {
        overlay.style.display = 'none';
      }, 180);
      document.body.classList.remove('kc-modal-open');
      setStatus('', '');
    }
    function open(payload) {
      var current = (payload && typeof payload === 'object') ? payload : {};
      submitHandler = typeof current.onSubmit === 'function' ? current.onSubmit : null;
      selectedRating = Math.max(0, Math.min(5, parseInt(String(current.rating != null ? current.rating : 0), 10) || 0));
      if (textarea) textarea.value = String(current.comment || '').trim().slice(0, 280);
      if (subtitle) {
        var targetName = String(current.targetName || 'este usu\u00E1rio').trim() || 'este usu\u00E1rio';
        subtitle.textContent = 'Compartilhe como foi sua intera\u00E7\u00E3o com ' + targetName + '.';
      }
      updateCounter();
      updateStars();
      setStatus('', '');
      submitBtn.disabled = false;
      overlay.style.display = 'flex';
      document.body.classList.add('kc-modal-open');
      window.requestAnimationFrame(function () { overlay.classList.add('active'); });
    }
    stars.forEach(function (button) {
      button.addEventListener('click', function () {
        selectedRating = Math.max(1, Math.min(5, parseInt(String(button.getAttribute('data-kc-rating-value') || '0'), 10) || 1));
        updateStars();
        setStatus('', '');
      });
    });
    if (textarea) textarea.addEventListener('input', updateCounter);
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (cancelBtn) cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && overlay.style.display !== 'none') close();
    });
    submitBtn.addEventListener('click', async function () {
      if (selectedRating < 1) {
        setStatus('Selecione de 1 a 5 estrelas para continuar.', 'error');
        return;
      }
      if (!submitHandler) {
        setStatus('A a\u00E7\u00E3o de avalia\u00E7\u00E3o n\u00E3o est\u00E1 dispon\u00EDvel agora.', 'error');
        return;
      }
      submitBtn.disabled = true;
      setStatus('Salvando avalia\u00E7\u00E3o...', '');
      try {
        var result = await submitHandler({
          rating: selectedRating,
          comment: String(textarea && textarea.value || '').trim().slice(0, 280),
        });
        if (result && result.ok) {
          setStatus('Avalia\u00E7\u00E3o salva com sucesso.', 'success');
          close();
          return;
        }
        setStatus((result && result.error && result.error.message) || 'N\u00E3o foi poss\u00EDvel salvar sua avalia\u00E7\u00E3o.', 'error');
      } catch (error) {
        setStatus((error && error.message) || 'N\u00E3o foi poss\u00EDvel salvar sua avalia\u00E7\u00E3o.', 'error');
      } finally {
        submitBtn.disabled = false;
      }
    });
    sellerRatingModal = { open: open, close: close };
    return sellerRatingModal;
  }
  function refreshSellerRatingUI(post, summary, ratingState, ctx) {
    var summaryEl = document.getElementById('sellerRatingSummary');
    var hintEl = document.getElementById('sellerRatingHint');
    var button = document.getElementById('sellerRateButton');
    var authorId = getPostAuthorId(post);
    var postId = getPostIdForMutation(post);
    var isLegacyExample = isLegacyExamplePost(post) || isLegacyExampleProfile(post && post.authorProfile);
    var normalizedSummary = normalizeSellerRatingSummary(summary && typeof summary === 'object' ? summary : getSellerRatingSummaryFromPost(post));
    var context = (ctx && typeof ctx === 'object') ? ctx : {};
    var viewer = context.currentUser || null;
    var getCurrentPost = typeof context.getCurrentPost === 'function' ? context.getCurrentPost : function () { return null; };
    applySellerRatingSummaryToPost(post, normalizedSummary);
    if (summaryEl) {
      summaryEl.innerHTML = buildSellerRatingSummaryHtml(normalizedSummary);
      summaryEl.style.display = 'grid';
    }
    if (!button) return;
    var viewerId = String((viewer && viewer.id) || '').trim();
    var isSelf = !!(viewerId && authorId && viewerId === authorId);
    var statePayload = (ratingState && typeof ratingState === 'object' && !Array.isArray(ratingState)) ? ratingState : null;
    var existingRating = statePayload && statePayload.myRating ? statePayload.myRating : null;
    var canRate = !!(statePayload && statePayload.canRate === true);
    button.style.display = 'none';
    button.disabled = false;
    button.className = 'kc-btn-secondary kc-btn-full';
    button.innerHTML = '';
    button.onclick = null;
    if (hintEl) {
      hintEl.textContent = '';
      hintEl.style.display = 'none';
    }
    if (!authorId || isLegacyExample || isSelf) {
      return;
    }
    if (!viewer || !viewer.id) {
      button.style.display = 'inline-flex';
      button.innerHTML = '<i class="fas fa-right-to-bracket"></i> Entrar para avaliar';
      button.onclick = function () { openAuthForUserRating(); };
      if (hintEl) {
        hintEl.textContent = getUserRatingReasonMessage('AUTH_REQUIRED');
        hintEl.style.display = 'block';
      }
      return;
    }
    function openRatingModal(initialRating, initialComment, nextLabel) {
      ensureSellerRatingModal().open({
        targetName: post.authorName || post.autor || post.author || 'este usu\u00E1rio',
        rating: initialRating,
        comment: initialComment,
        onSubmit: async function (payload) {
          var result = await window.KCAPI.upsertUserRating({
            targetUserId: authorId,
            contextPostId: postId,
            rating: payload.rating,
            comment: payload.comment,
          });
          if (result && result.ok) {
            var livePost = getCurrentPost() || post;
            applySellerRatingSummaryToPost(livePost, result.summary);
            refreshSellerRatingUI(livePost, result.summary, {
              targetUserId: authorId,
              contextPostId: postId,
              canRate: true,
              reason: 'OK',
              myRating: result.rating,
            }, context);
            toast(nextLabel, 'success', 1800);
          }
          return result;
        },
      });
    }
    if (existingRating) {
      button.style.display = 'inline-flex';
      button.className = 'kc-btn-primary kc-btn-full';
      button.innerHTML = '<i class="fas fa-pen"></i> Editar avalia\u00E7\u00E3o';
      if (hintEl) {
        hintEl.textContent = 'Sua nota atual: ' + String(existingRating.rating || 0) + ' estrela' + (Number(existingRating.rating) === 1 ? '' : 's') + '.';
        hintEl.style.display = 'block';
      }
      button.onclick = function () {
        openRatingModal(existingRating.rating || 0, existingRating.comment || '', 'Avalia\u00E7\u00E3o atualizada.');
      };
      return;
    }
    if (canRate) {
      button.style.display = 'inline-flex';
      button.className = 'kc-btn-primary kc-btn-full';
      button.innerHTML = '<i class="fas fa-star"></i> Avaliar usu\u00E1rio';
      button.onclick = function () {
        openRatingModal(0, '', 'Avalia\u00E7\u00E3o enviada.');
      };
      return;
    }
    button.style.display = 'inline-flex';
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-lock"></i> Avalia\u00E7\u00E3o indispon\u00EDvel';
    if (hintEl) {
      hintEl.textContent = getUserRatingReasonMessage(statePayload && statePayload.reason);
      hintEl.style.display = 'block';
    }
  }
  window._KCProduct.ratings = {
    normalizeSellerRatingSummary: normalizeSellerRatingSummary,
    getSellerRatingSummaryFromPost: getSellerRatingSummaryFromPost,
    applySellerRatingSummaryToPost: applySellerRatingSummaryToPost,
    refreshSellerRatingUI: refreshSellerRatingUI,
  };
})();
