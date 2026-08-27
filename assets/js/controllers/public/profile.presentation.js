(function () {
  'use strict';

  window._KCPR = window._KCPR || {};

  function getState(deps) {
    return (deps && deps.state && typeof deps.state === 'object') ? deps.state : {};
  }

  function getShared(deps) {
    return (deps && deps.shared && typeof deps.shared === 'object') ? deps.shared : (window.KCAccountProfileUtils || {});
  }

  function select(deps, selector) {
    if (deps && typeof deps.$ === 'function') return deps.$(selector);
    if (typeof document !== 'undefined' && document && typeof document.querySelector === 'function') {
      return document.querySelector(selector);
    }
    return null;
  }

  function isOwnerViewValue(deps) {
    if (deps && typeof deps.isOwnerView === 'function') return !!deps.isOwnerView();
    return !getState(deps).isPublicView;
  }

  function clearAvatarDraftValue(deps) {
    if (deps && typeof deps.clearAvatarDraft === 'function') deps.clearAvatarDraft();
  }

  function esc(value) {
    var text = String(value == null ? '' : value);
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(text);
    }
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeName(profile, user) {
    var candidate = profile && (profile.display_name || profile.full_name);
    if (candidate && String(candidate).trim()) return String(candidate).trim();
    var email = user && user.email ? String(user.email) : '';
    if (email.includes('@')) return email.split('@')[0];
    return 'Usu\u00e1rio';
  }

  function buildPublicHandle(profile) {
    var source = profile && (profile.display_name || profile.full_name);
    if (window.KCUtils && typeof window.KCUtils.buildPublicHandle === 'function') {
      return window.KCUtils.buildPublicHandle(source);
    }
    var normalized = String(source || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return normalized ? ('@' + normalized.slice(0, 32)) : '';
  }

  function safeHandle(profile, user, deps) {
    var email = user && user.email ? String(user.email) : '';
    if (!getState(deps).isPublicView && email.includes('@')) return '@' + email.split('@')[0];
    return buildPublicHandle(profile);
  }

  function buildAccountSetupHref(deps) {
    var state = getState(deps);
    var shared = getShared(deps);
    var base = '/account-setup.html';
    var next = '/profile.html' + (state.profileId ? ('?id=' + encodeURIComponent(state.profileId)) : '');
    if (shared && typeof shared.normalizeNextPath === 'function') {
      return base + '?next=' + encodeURIComponent(shared.normalizeNextPath(next, '/profile.html'));
    }
    return base + '?next=' + encodeURIComponent(next);
  }

  function buildSettingsHref(deps) {
    var state = getState(deps);
    var shared = getShared(deps);
    var base = '/settings.html';
    var next = '/profile.html' + (state.profileId ? ('?id=' + encodeURIComponent(state.profileId)) : '');
    if (shared && typeof shared.normalizeNextPath === 'function') {
      return base + '?next=' + encodeURIComponent(shared.normalizeNextPath(next, '/profile.html'));
    }
    return base + '?next=' + encodeURIComponent(next);
  }

  function formatChoice(field, value, deps) {
    var shared = getShared(deps);
    if (!value) return '';
    if (shared && typeof shared.formatProfileValue === 'function') {
      return shared.formatProfileValue(field, value);
    }
    return String(value || '').trim();
  }

  function getProfileVisibleSocialLinks(profile, deps) {
    var shared = getShared(deps);
    if (shared && typeof shared.getVisibleSocialLinks === 'function') {
      return shared.getVisibleSocialLinks(profile || {});
    }
    return [];
  }

  function currentAvatarUrl(deps) {
    var state = getState(deps);
    var shared = getShared(deps);
    if (state.avatarPreviewUrl) return state.avatarPreviewUrl;
    var avatarUrl = state.profile && state.profile.avatar_url ? String(state.profile.avatar_url) : '';
    if (avatarUrl) return avatarUrl;
    if (shared && typeof shared.buildDefaultAvatarDataUrl === 'function') {
      return shared.buildDefaultAvatarDataUrl(safeName(state.profile || {}, state.user || null));
    }
    return '';
  }

  function fmtDate(iso, options) {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleDateString('pt-BR', options || {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch (_) {
      return '-';
    }
  }

  function fmtRelative(iso) {
    if (!iso) return '';
    var target = new Date(iso).getTime();
    if (!Number.isFinite(target)) return '';
    var delta = Date.now() - target;
    var seconds = Math.max(0, Math.floor(delta / 1000));
    if (seconds < 60) return 'agora';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return 'h\u00e1 ' + minutes + ' min';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return 'h\u00e1 ' + hours + 'h';
    var days = Math.floor(hours / 24);
    if (days < 30) return 'h\u00e1 ' + days + ' dia' + (days > 1 ? 's' : '');
    return fmtDate(iso);
  }

  function buildPostDetailHref(postId) {
    var normalized = String(postId || '').trim();
    if (!normalized) return '';
    if (window.KCUtils && typeof window.KCUtils.buildProductDetailHref === 'function') {
      return window.KCUtils.buildProductDetailHref(normalized);
    }
    return 'product.html?id=' + encodeURIComponent(normalized);
  }

  function statusBadge(status) {
    var key = String(status || 'published').trim().toLowerCase();
    var labels = {
      published: 'Publicado',
      pending: 'Pendente',
      hidden: 'Oculto',
      deleted: 'Exclu\u00eddo'
    };
    return '<span class="kc-status-badge kc-status-badge--' + esc(key) + '">' + esc(labels[key] || key) + '</span>';
  }

  function visibilityBadge(visibility) {
    var key = String(visibility || 'public').trim().toLowerCase();
    var labels = {
      public: 'P\u00fablico',
      community: 'Comunidade'
    };
    var icon = key === 'community' ? 'fas fa-user-group' : 'fas fa-globe';
    return '<span class="kc-profile-save-badge kc-profile-save-badge--later"><i class="' + esc(icon) + '"></i> ' + esc(labels[key] || 'P\u00fablico') + '</span>';
  }

  function normalizeSaveKinds(value) {
    var list = Array.isArray(value) ? value : (value ? [value] : []);
    var allowed = new Set(['favorite', 'later', 'highlight']);
    return list
      .map(function (item) { return String(item || '').trim().toLowerCase(); })
      .filter(function (item, index, array) {
        return item && allowed.has(item) && array.indexOf(item) === index;
      });
  }

  function saveKindBadge(kind) {
    var current = {
      favorite: { icon: 'fas fa-heart', label: 'Favorito' },
      later: { icon: 'fas fa-clock', label: 'Lembrar Depois' },
      highlight: { icon: 'fas fa-star', label: 'Destaque' }
    }[String(kind || '').trim().toLowerCase()];
    if (!current) return '';
    return '<span class="kc-profile-save-badge kc-profile-save-badge--' + esc(kind) + '"><i class="' + esc(current.icon) + '"></i> ' + esc(current.label) + '</span>';
  }

  function buildSaveBadges(kinds) {
    return normalizeSaveKinds(kinds).map(saveKindBadge).join('');
  }

  function linkifyBio(text) {
    var source = String(text || '').trim();
    if (!source) return '';
    var escaped = esc(source).replace(/\r?\n/g, '<br>');
    return escaped.replace(/((https?:\/\/|www\.)[^\s<]+)/gi, function (match) {
      var href = /^https?:\/\//i.test(match) ? match : ('https://' + match);
      return '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + match + '</a>';
    });
  }

  function setStatus(message, tone, deps) {
    var feedback = select(deps, '#profile-feedback');
    if (!feedback) return;
    if (!message) {
      feedback.style.display = 'none';
      feedback.textContent = '';
      feedback.className = 'kc-profile-feedback';
      return;
    }
    feedback.style.display = 'block';
    feedback.textContent = message;
    feedback.className = 'kc-profile-feedback is-' + (tone || 'info');
  }

  function setBadgeCount(id, count, deps) {
    var badge = select(deps, id);
    if (!badge) return;
    var value = Math.max(0, Number(count) || 0);
    badge.textContent = value > 99 ? '99+' : String(value);
  }

  function normalizeRatingSummary(raw, fallbackUserId) {
    var source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    var averageRaw = source.average != null ? source.average : source.rating_avg;
    var average = (averageRaw != null && averageRaw !== '') ? Number(averageRaw) : null;
    var countRaw = source.count != null ? source.count : source.rating_count;
    var count = Math.max(0, parseInt(String(countRaw != null ? countRaw : 0), 10) || 0);
    return {
      userId: String(source.userId || source.user_id || fallbackUserId || '').trim() || null,
      average: Number.isFinite(average) ? Number(average.toFixed(2)) : null,
      count: count
    };
  }

  function getProfileRatingSummaryFromProfile(profile) {
    return normalizeRatingSummary({
      userId: profile && profile.id,
      average: profile && (profile.ratingAvg != null ? profile.ratingAvg : profile.rating_avg),
      count: profile && (profile.ratingCount != null ? profile.ratingCount : profile.rating_count)
    }, profile && profile.id);
  }

  function renderProfileRatingSummary(deps) {
    var state = getState(deps);
    var summary = normalizeRatingSummary(state.ratingSummary, state.profileId || (state.profile && state.profile.id));
    var statValue = select(deps, '#stat-rating');
    var statLabel = select(deps, '#stat-rating-label');
    if (statValue) statValue.textContent = (summary.count > 0 && Number.isFinite(summary.average)) ? summary.average.toFixed(1) : '-';
    if (statLabel) statLabel.textContent = summary.count > 0 ? ('Reputa\u00e7\u00e3o (' + summary.count + ')') : 'Reputa\u00e7\u00e3o';
    setBadgeCount('#badge-ratings', summary.count, deps);
  }

  function buildRatingStars(score) {
    var value = Math.max(0, Math.min(5, parseInt(String(score != null ? score : 0), 10) || 0));
    var output = [];
    for (var index = 1; index <= 5; index += 1) {
      output.push('<i class="fas fa-star' + (index <= value ? ' is-active' : '') + '"></i>');
    }
    return output.join('');
  }

  function syncFormFromProfile(deps) {
    var state = getState(deps);
    var nameInput = select(deps, '#display-name-input');
    var bioInput = select(deps, '#profile-bio-input');
    if (nameInput) nameInput.value = state.profile && (state.profile.display_name || state.profile.full_name) ? String(state.profile.display_name || state.profile.full_name) : '';
    if (bioInput) bioInput.value = state.profile && state.profile.bio ? String(state.profile.bio) : '';
    updateBioCounter(deps);
  }

  function updateBioCounter(deps) {
    var bioInput = select(deps, '#profile-bio-input');
    var counter = select(deps, '#profile-bio-counter');
    var limit = Number(deps && deps.bioLimit) || 200;
    if (!counter) return;
    var length = Math.min(limit, String((bioInput && bioInput.value) || '').length);
    counter.textContent = length + '/' + limit;
  }

  function setEditing(active, deps) {
    var state = getState(deps);
    if (!isOwnerViewValue(deps)) return;
    state.isEditing = !!active;
    var form = select(deps, '#profile-inline-form');
    var bio = select(deps, '#profile-bio');
    var editToggle = select(deps, '#profile-edit-toggle');

    if (form) {
      form.style.display = state.isEditing ? 'block' : 'none';
      if (form.classList && typeof form.classList.toggle === 'function') {
        form.classList.toggle('is-active', state.isEditing);
      }
    }
    if (editToggle) {
      editToggle.innerHTML = state.isEditing
        ? '<i class="fas fa-times"></i> Fechar edi\u00e7\u00e3o'
        : '<i class="fas fa-pen"></i> Editar perfil';
    }

    if (state.isEditing) {
      syncFormFromProfile(deps);
      if (bio) bio.style.display = 'none';
      setStatus('', 'info', deps);
      return;
    }

    clearAvatarDraftValue(deps);
    renderHeader(deps);
    setStatus('', 'info', deps);
  }

  function renderHeader(deps) {
    var state = getState(deps);
    var shared = getShared(deps);
    var profile = state.profile || {};
    var user = state.user || null;
    var ownerView = isOwnerViewValue(deps);
    var name = safeName(profile, user);
    var handle = safeHandle(profile, user, deps);
    var bioText = String(profile.bio || '').trim();
    var savedLabel = state.isPublicView ? 'Destaques' : 'Salvos';
    var savedTitle = state.isPublicView ? 'Destaques' : 'Salvos';
    var savedEmptyText = state.isPublicView
      ? 'Nenhum destaque p\u00fablico encontrado.'
      : 'Nenhuma publica\u00e7\u00e3o salva ainda.';

    var avatar = select(deps, '#profile-avatar');
    if (avatar) {
      avatar.src = currentAvatarUrl(deps);
      avatar.alt = 'Avatar de ' + name;
    }

    var avatarWrap = select(deps, '#profileAvatarWrap');
    if (avatarWrap && state.profileId) {
      avatarWrap.dataset.userId = state.profileId;
    }

    var verifiedIcon = select(deps, '#profile-verified-icon');
    if (verifiedIcon) verifiedIcon.style.display = profile && profile.verified === true ? 'flex' : 'none';

    var avatarEdit = select(deps, '#profile-avatar-edit');
    if (avatarEdit) avatarEdit.style.display = ownerView ? 'inline-flex' : 'none';

    var editToggle = select(deps, '#profile-edit-toggle');
    if (editToggle) {
      editToggle.style.display = ownerView ? 'inline-flex' : 'none';
      var onboardingComplete = !(shared && typeof shared.isOnboardingComplete === 'function') || shared.isOnboardingComplete(profile);
      editToggle.innerHTML = onboardingComplete
        ? '<i class="fas fa-sliders"></i> Configura\u00e7\u00f5es'
        : '<i class="fas fa-list-check"></i> Completar cadastro';
    }

    // v9.3.5.10: bot\u00e3o "Conversar" \u2014 s\u00f3 aparece quando N\u00c3O \u00e9 o dono e h\u00e1 um user logado
    var chatBtn = select(deps, '#profile-chat-btn');
    if (chatBtn && profile && profile.id) {
      var showChat = !ownerView && state.user && state.user.id;
      chatBtn.style.display = showChat ? 'inline-flex' : 'none';
      if (showChat) {
        chatBtn.href = 'mensagens.html?with=' + encodeURIComponent(profile.id);
      }
    }

    var nameEl = select(deps, '#profile-display-name');
    if (nameEl) nameEl.textContent = name;
    if (typeof document !== 'undefined' && document) {
      document.title = name + ' \u2014 Perfil KinoCampus';
    }

    var legacyBadge = select(deps, '#profile-legacy-badge');
    if (legacyBadge) {
      var isLegacy = !!(profile && String(profile.legacy_id || profile.legacyId || '').trim());
      legacyBadge.style.display = isLegacy ? '' : 'none';
    }

    var handleEl = select(deps, '#profile-handle');
    if (handleEl) {
      if (handle) {
        handleEl.textContent = handle;
        handleEl.style.display = 'block';
      } else {
        handleEl.style.display = 'none';
      }
    }

    var memberSince = select(deps, '#profile-member-since');
    if (memberSince) {
      var inner = typeof memberSince.querySelector === 'function' ? memberSince.querySelector('span') : null;
      if (profile && profile.created_at && inner) {
        inner.textContent = 'Desde ' + fmtDate(profile.created_at, { month: 'short', year: 'numeric' });
        memberSince.style.display = 'inline-flex';
      } else {
        memberSince.style.display = 'none';
      }
    }

    var bio = select(deps, '#profile-bio');
    if (bio) {
      if (bioText) {
        bio.innerHTML = linkifyBio(bioText);
        if (bio.classList && typeof bio.classList.remove === 'function') bio.classList.remove('is-empty');
        bio.style.display = state.isEditing ? 'none' : 'block';
      } else if (ownerView) {
        bio.textContent = 'Adicione uma breve descri\u00e7\u00e3o para completar seu perfil.';
        if (bio.classList && typeof bio.classList.add === 'function') bio.classList.add('is-empty');
        bio.style.display = state.isEditing ? 'none' : 'block';
      } else {
        bio.textContent = '';
        if (bio.classList && typeof bio.classList.remove === 'function') bio.classList.remove('is-empty');
        bio.style.display = 'none';
      }
    }

    var meta = select(deps, '.kc-profile-meta');
    if (meta) {
      meta.innerHTML = '';
      if (profile && profile.created_at && typeof meta.insertAdjacentHTML === 'function') {
        meta.insertAdjacentHTML('beforeend', '<span id="profile-member-since"><i class="fas fa-calendar-alt"></i> <span>Desde ' + esc(fmtDate(profile.created_at, { month: 'short', year: 'numeric' })) + '</span></span>');
      }
      if (profile.affiliation) {
        var affiliationLabel = formatChoice('affiliation', profile.affiliation, deps);
        if (affiliationLabel && typeof meta.insertAdjacentHTML === 'function') {
          meta.insertAdjacentHTML('beforeend', '<span><i class="fas fa-user-graduate"></i> ' + esc(affiliationLabel) + '</span>');
        }
      }
    }

    var contextPills = select(deps, '#profile-context-pills');
    if (contextPills) {
      contextPills.innerHTML = '';
      contextPills.style.display = 'none';
    }

    var socialLinksWrap = select(deps, '#profile-social-links');
    var visibleLinks = getProfileVisibleSocialLinks(profile, deps);
    if (socialLinksWrap) {
      socialLinksWrap.innerHTML = visibleLinks.map(function (entry) {
        var label = entry.display || entry.handle || entry.label;
        var iconHtml = entry.key === 'x'
          ? '<span class="kc-profile-social-glyph" aria-hidden="true">' + esc(entry.emoji || '\ud835\udd4f') + '</span>'
          : '<i class="' + esc(entry.iconClass || 'fas fa-link') + '" aria-hidden="true"></i>';
        return '<a class="kc-profile-social-link" href="' + esc(entry.href) + '" target="_blank" rel="noopener noreferrer">' + iconHtml + '<span>' + esc(label) + '</span></a>';
      }).join('');
      socialLinksWrap.style.display = visibleLinks.length ? 'flex' : 'none';
    }

    var setupHint = select(deps, '#profile-setup-hint');
    if (setupHint) {
      var setupComplete = !shared.isOnboardingComplete || shared.isOnboardingComplete(profile);
      if (ownerView && (!visibleLinks.length || !setupComplete)) {
        setupHint.innerHTML = 'Complete seus links e prefer\u00eancias de contato em <a href="' + esc(buildAccountSetupHref(deps)) + '">completar cadastro</a>.';
        setupHint.style.display = 'block';
      } else if (ownerView) {
        setupHint.innerHTML = 'Voc\u00ea pode ajustar seus links p\u00fablicos e o contato principal dos an\u00fancios em <a href="' + esc(buildSettingsHref(deps)) + '">configura\u00e7\u00f5es</a>.';
        setupHint.style.display = 'block';
      } else {
        setupHint.textContent = '';
        setupHint.style.display = 'none';
      }
    }

    if (!state.isEditing) syncFormFromProfile(deps);

    var savedTabLabel = select(deps, '#saved-tab-label');
    if (savedTabLabel) savedTabLabel.textContent = savedLabel;

    var savedToolbarTitle = select(deps, '#saved-toolbar-title');
    if (savedToolbarTitle) savedToolbarTitle.textContent = savedTitle;

    var savedSelect = select(deps, '#profile-saved-kind');
    if (savedSelect) {
      savedSelect.style.display = state.isPublicView ? 'none' : '';
      savedSelect.value = state.savedKind || '';
    }

    var postsStatus = select(deps, '#profile-posts-status');
    if (postsStatus) postsStatus.style.display = state.isPublicView ? 'none' : '';

    var savedEmpty = select(deps, '#saved-empty');
    if (savedEmpty) savedEmpty.innerHTML = '<i class="fas fa-star"></i> ' + esc(savedEmptyText);

    state.ratingSummary = normalizeRatingSummary(
      state.ratingSummary && state.ratingSummary.count ? state.ratingSummary : getProfileRatingSummaryFromProfile(profile),
      state.profileId || profile.id
    );
    renderProfileRatingSummary(deps);
  }

  window._KCPR.presentation = Object.freeze({
    buildAccountSetupHref: buildAccountSetupHref,
    buildPostDetailHref: buildPostDetailHref,
    buildPublicHandle: buildPublicHandle,
    buildRatingStars: buildRatingStars,
    buildSaveBadges: buildSaveBadges,
    buildSettingsHref: buildSettingsHref,
    currentAvatarUrl: currentAvatarUrl,
    esc: esc,
    fmtDate: fmtDate,
    fmtRelative: fmtRelative,
    formatChoice: formatChoice,
    getProfileRatingSummaryFromProfile: getProfileRatingSummaryFromProfile,
    getProfileVisibleSocialLinks: getProfileVisibleSocialLinks,
    linkifyBio: linkifyBio,
    normalizeRatingSummary: normalizeRatingSummary,
    normalizeSaveKinds: normalizeSaveKinds,
    renderHeader: renderHeader,
    renderProfileRatingSummary: renderProfileRatingSummary,
    safeHandle: safeHandle,
    safeName: safeName,
    saveKindBadge: saveKindBadge,
    setBadgeCount: setBadgeCount,
    setEditing: setEditing,
    setStatus: setStatus,
    statusBadge: statusBadge,
    syncFormFromProfile: syncFormFromProfile,
    updateBioCounter: updateBioCounter,
    visibilityBadge: visibilityBadge
  });
})();
