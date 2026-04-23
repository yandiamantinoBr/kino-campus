(function () {
  'use strict';

  window._KCPR = window._KCPR || {};

  function getState(deps) {
    return (deps && deps.state && typeof deps.state === 'object') ? deps.state : {};
  }

  function select(deps, selector) {
    if (deps && typeof deps.$ === 'function') return deps.$(selector);
    if (typeof document !== 'undefined' && document && typeof document.querySelector === 'function') {
      return document.querySelector(selector);
    }
    return null;
  }

  function createDomElement(tagName) {
    if (typeof document !== 'undefined' && document && typeof document.createElement === 'function') {
      return document.createElement(tagName);
    }
    return null;
  }

  function getPresentation() {
    return (window._KCPR && window._KCPR.presentation) ? window._KCPR.presentation : null;
  }

  function getCollections() {
    return (window._KCPR && window._KCPR.collections) ? window._KCPR.collections : null;
  }

  function getRatingsPageSize(deps) {
    return Math.max(1, Number(deps && deps.ratingsPageSize) || 10);
  }

  function _esc(value, deps) {
    if (deps && typeof deps.esc === 'function') return deps.esc(value);
    var presentation = getPresentation();
    if (presentation && typeof presentation.esc === 'function') return presentation.esc(value);
    return String(value == null ? '' : value);
  }

  function _fmtRelative(value, deps) {
    if (deps && typeof deps.fmtRelative === 'function') return deps.fmtRelative(value);
    var presentation = getPresentation();
    if (presentation && typeof presentation.fmtRelative === 'function') return presentation.fmtRelative(value);
    return String(value || '');
  }

  function _buildRatingStars(value, deps) {
    if (deps && typeof deps.buildRatingStars === 'function') return deps.buildRatingStars(value);
    var presentation = getPresentation();
    if (presentation && typeof presentation.buildRatingStars === 'function') return presentation.buildRatingStars(value);
    return '';
  }

  function _normalizeRatingSummary(raw, fallbackUserId, deps) {
    if (deps && typeof deps.normalizeRatingSummary === 'function') {
      return deps.normalizeRatingSummary(raw, fallbackUserId);
    }
    var presentation = getPresentation();
    if (presentation && typeof presentation.normalizeRatingSummary === 'function') {
      return presentation.normalizeRatingSummary(raw, fallbackUserId);
    }
    return {
      userId: String((raw && (raw.userId || raw.user_id)) || fallbackUserId || '').trim() || null,
      average: null,
      count: Math.max(0, Number(raw && (raw.count != null ? raw.count : raw && raw.rating_count)) || 0)
    };
  }

  function _renderProfileRatingSummary(deps) {
    if (deps && typeof deps.renderProfileRatingSummary === 'function') {
      deps.renderProfileRatingSummary();
      return;
    }
    var presentation = getPresentation();
    if (presentation && typeof presentation.renderProfileRatingSummary === 'function') {
      presentation.renderProfileRatingSummary(deps || {});
    }
  }

  function _renderInlineRichText(value, deps) {
    if (deps && typeof deps.renderInlineRichText === 'function') return deps.renderInlineRichText(value);
    var collections = getCollections();
    if (collections && typeof collections.renderInlineRichText === 'function') {
      return collections.renderInlineRichText(value, deps || {});
    }
    if (typeof window.renderCommentMarkdownInline === 'function') {
      return window.renderCommentMarkdownInline(String(value || ''));
    }
    return _esc(value, deps);
  }

  function renderRatings(items, append, deps) {
    var state = getState(deps);
    var list = select(deps, '#ratings-list');
    var empty = select(deps, '#ratings-empty');
    var loadMore = select(deps, '#ratings-load-more');
    if (!list) return;

    if (!append) list.innerHTML = '';

    if (!Array.isArray(items) || !items.length) {
      if (!append && empty) empty.style.display = 'block';
      if (loadMore) loadMore.style.display = 'none';
      return;
    }

    if (empty) empty.style.display = 'none';

    items.forEach(function (entry) {
      var card = createDomElement('article');
      if (!card) return;
      var reviewer = (entry && entry.reviewer && typeof entry.reviewer === 'object') ? entry.reviewer : {};
      var isPublicReviewer = reviewer.public === true;
      var reviewerName = isPublicReviewer
        ? (reviewer.displayName || reviewer.display_name || 'Membro da comunidade')
        : 'Membro da comunidade';
      var avatarHtml = (isPublicReviewer && reviewer.avatarUrl)
        ? '<img class="kc-profile-rating-card__avatar" src="' + _esc(reviewer.avatarUrl, deps) + '" alt="Avatar de ' + _esc(reviewerName, deps) + '" />'
        : '<span class="kc-profile-rating-card__avatar-placeholder" aria-hidden="true"><i class="fas fa-user"></i></span>';
      var comment = String(entry && entry.comment || '').trim();
      var commentHtml = comment
        ? '<div class="kc-profile-rating-card__comment">' + _renderInlineRichText(comment, deps) + '</div>'
        : '<div class="kc-profile-rating-card__comment is-empty">O avaliador n\u00e3o deixou coment\u00e1rio.</div>';

      card.className = 'kc-profile-rating-card';
      card.innerHTML = [
        '<div class="kc-profile-rating-card__top">',
        '<div class="kc-profile-rating-card__reviewer">',
        avatarHtml,
        '<div class="kc-profile-rating-card__reviewer-copy">',
        '<div class="kc-profile-rating-card__reviewer-name">' + _esc(reviewerName, deps) + '</div>',
        '<div class="kc-profile-rating-card__reviewer-meta">',
        '<span><i class="fas fa-clock"></i> ' + _esc(_fmtRelative(entry && entry.createdAt, deps), deps) + '</span>',
        (entry && entry.contextPostId) ? '<span><i class="fas fa-link"></i> Intera\u00e7\u00e3o registrada</span>' : '',
        '</div>',
        '</div>',
        '</div>',
        '<div class="kc-profile-rating-card__stars" aria-label="' + _esc(String(entry && entry.rating || 0), deps) + ' estrelas">' + _buildRatingStars(entry && entry.rating, deps) + '<span class="kc-profile-rating-card__score">' + _esc(String(entry && entry.rating || 0), deps) + '/5</span></div>',
        '</div>',
        commentHtml
      ].join('');
      if (typeof list.appendChild === 'function') list.appendChild(card);
    });

    if (loadMore) loadMore.style.display = state.ratingHasMore ? 'block' : 'none';
  }

  async function loadRatings(reset, deps) {
    var state = getState(deps);
    var loading = select(deps, '#ratings-loading');
    var empty = select(deps, '#ratings-empty');
    var loadMore = select(deps, '#ratings-load-more');

    if (reset) {
      state.ratingPage = 1;
      state.ratings = [];
      var list = select(deps, '#ratings-list');
      if (list) list.innerHTML = '';
    }

    if (loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';
    if (loadMore) loadMore.style.display = 'none';

    try {
      var payload = await window.KCAPI.listUserRatings(state.profileId, {
        page: state.ratingPage,
        limit: getRatingsPageSize(deps)
      });
      var items = Array.isArray(payload && payload.items) ? payload.items : [];
      state.ratings = reset ? items : state.ratings.concat(items);
      state.ratingHasMore = !!(payload && payload.hasMore === true);
      if (payload && typeof payload.total === 'number') {
        var currentSummary = _normalizeRatingSummary(state.ratingSummary, state.profileId, deps);
        state.ratingSummary = _normalizeRatingSummary({
          userId: state.profileId,
          average: currentSummary.average,
          count: payload.total
        }, state.profileId, deps);
        _renderProfileRatingSummary(deps);
      }
      renderRatings(reset ? state.ratings : items, !reset, deps);
    } catch (error) {
      console.warn('[Profile] loadRatings:', error);
      if (empty) empty.style.display = 'block';
    } finally {
      if (loading) loading.style.display = 'none';
    }
  }

  window._KCPR.ratings = Object.freeze({
    loadRatings: loadRatings,
    renderRatings: renderRatings
  });
})();
