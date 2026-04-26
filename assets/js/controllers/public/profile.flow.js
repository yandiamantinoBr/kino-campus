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

  function getPresentation() {
    return (window._KCPR && window._KCPR.presentation) ? window._KCPR.presentation : null;
  }

  function getCollections() {
    return (window._KCPR && window._KCPR.collections) ? window._KCPR.collections : null;
  }

  function getRatings() {
    return (window._KCPR && window._KCPR.ratings) ? window._KCPR.ratings : null;
  }

  function _esc(value, deps) {
    if (deps && typeof deps.esc === 'function') return deps.esc(value);
    var presentation = getPresentation();
    if (presentation && typeof presentation.esc === 'function') return presentation.esc(value);
    return String(value == null ? '' : value);
  }

  function _setStatus(message, tone, deps) {
    if (deps && typeof deps.setStatus === 'function') {
      deps.setStatus(message, tone);
      return;
    }
    var presentation = getPresentation();
    if (presentation && typeof presentation.setStatus === 'function') {
      presentation.setStatus(message, tone, deps || {});
    }
  }

  function _setBadgeCount(selector, count, deps) {
    if (deps && typeof deps.setBadgeCount === 'function') {
      deps.setBadgeCount(selector, count);
      return;
    }
    var presentation = getPresentation();
    if (presentation && typeof presentation.setBadgeCount === 'function') {
      presentation.setBadgeCount(selector, count, deps || {});
    }
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

  function _getProfileRatingSummaryFromProfile(profile, deps) {
    if (deps && typeof deps.getProfileRatingSummaryFromProfile === 'function') {
      return deps.getProfileRatingSummaryFromProfile(profile);
    }
    var presentation = getPresentation();
    if (presentation && typeof presentation.getProfileRatingSummaryFromProfile === 'function') {
      return presentation.getProfileRatingSummaryFromProfile(profile);
    }
    return _normalizeRatingSummary({}, profile && profile.id, deps);
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

  function _renderHeader(deps) {
    if (deps && typeof deps.renderHeader === 'function') {
      deps.renderHeader();
      return;
    }
    var presentation = getPresentation();
    if (presentation && typeof presentation.renderHeader === 'function') {
      presentation.renderHeader(deps || {});
    }
  }

  function _setEditing(active, deps) {
    if (deps && typeof deps.setEditing === 'function') {
      deps.setEditing(active);
      return;
    }
    var presentation = getPresentation();
    if (presentation && typeof presentation.setEditing === 'function') {
      presentation.setEditing(active, deps || {});
    }
  }

  function _buildAccountSetupHref(deps) {
    if (deps && typeof deps.buildAccountSetupHref === 'function') {
      return deps.buildAccountSetupHref();
    }
    var presentation = getPresentation();
    if (presentation && typeof presentation.buildAccountSetupHref === 'function') {
      return presentation.buildAccountSetupHref(deps || {});
    }
    return '/account-setup.html';
  }

  function _buildSettingsHref(deps) {
    if (deps && typeof deps.buildSettingsHref === 'function') {
      return deps.buildSettingsHref();
    }
    var presentation = getPresentation();
    if (presentation && typeof presentation.buildSettingsHref === 'function') {
      return presentation.buildSettingsHref(deps || {});
    }
    return '/settings.html';
  }

  function _getClient(deps) {
    if (deps && typeof deps.getClient === 'function') return deps.getClient();
    if (window.KCSupabase && typeof window.KCSupabase.getClient === 'function') {
      return window.KCSupabase.getClient();
    }
    return null;
  }

  function _restoreCachedProfile(deps) {
    if (deps && typeof deps.restoreCachedProfile === 'function') {
      return !!deps.restoreCachedProfile();
    }
    return false;
  }

  function _persistCachedProfile(profile, deps) {
    if (deps && typeof deps.persistCachedProfile === 'function') {
      deps.persistCachedProfile(profile);
    }
  }

  function _readProfileIdFromQuery(deps) {
    if (deps && typeof deps.readProfileIdFromQuery === 'function') {
      return deps.readProfileIdFromQuery();
    }
    var raw = new URLSearchParams((window.location && window.location.search) || '').get('id');
    return String(raw || '').trim();
  }

  function _releaseAvatarPreview(deps) {
    if (deps && typeof deps.releaseAvatarPreview === 'function') {
      deps.releaseAvatarPreview();
      return;
    }
    var state = getState(deps);
    if (state.avatarPreviewUrl && /^blob:/i.test(state.avatarPreviewUrl)) {
      try {
        URL.revokeObjectURL(state.avatarPreviewUrl);
      } catch (_) { }
    }
    state.avatarPreviewUrl = '';
  }

  function _clearAvatarDraft(deps) {
    if (deps && typeof deps.clearAvatarDraft === 'function') {
      deps.clearAvatarDraft();
      return;
    }
    var state = getState(deps);
    state.avatarFile = null;
    _releaseAvatarPreview(deps);
    var input = select(deps, '#profile-avatar-input');
    if (input) input.value = '';
  }

  function _isOwnerView(deps) {
    if (deps && typeof deps.isOwnerView === 'function') return !!deps.isOwnerView();
    return !getState(deps).isPublicView;
  }

  async function _probeRestrictedProfile(profileId, deps) {
    if (deps && typeof deps.probeRestrictedProfile === 'function') {
      return deps.probeRestrictedProfile(profileId);
    }
    var client = _getClient(deps);
    var state = getState(deps);
    if (!client || !profileId || state.viewerAuthenticated) return false;

    try {
      var response = await client.rpc('kc_get_profile_access_state', { p_profile_id: profileId });
      if (response && response.error) return false;
      var row = Array.isArray(response && response.data) ? response.data[0] : response && response.data;
      return !!(row && row.exists === true && row.profile_public === false);
    } catch (_) {
      return false;
    }
  }

  function _loadSavedBadgeCount(authorId, deps) {
    if (deps && typeof deps.loadSavedBadgeCount === 'function') {
      return deps.loadSavedBadgeCount(authorId);
    }
    var collections = getCollections();
    if (collections && typeof collections.loadSavedBadgeCount === 'function') {
      return collections.loadSavedBadgeCount(authorId, deps || {});
    }
    return Promise.resolve();
  }

  function _loadPosts(reset, deps) {
    if (deps && typeof deps.loadPosts === 'function') return deps.loadPosts(reset);
    var collections = getCollections();
    if (collections && typeof collections.loadPosts === 'function') {
      return collections.loadPosts(reset, deps || {});
    }
    return Promise.resolve();
  }

  function _loadComments(reset, deps) {
    if (deps && typeof deps.loadComments === 'function') return deps.loadComments(reset);
    var collections = getCollections();
    if (collections && typeof collections.loadComments === 'function') {
      return collections.loadComments(reset, deps || {});
    }
    return Promise.resolve();
  }

  function _loadRatings(reset, deps) {
    if (deps && typeof deps.loadRatings === 'function') return deps.loadRatings(reset);
    var ratings = getRatings();
    if (ratings && typeof ratings.loadRatings === 'function') {
      return ratings.loadRatings(reset, deps || {});
    }
    return Promise.resolve();
  }

  function _loadSaved(reset, deps) {
    if (deps && typeof deps.loadSaved === 'function') return deps.loadSaved(reset);
    var collections = getCollections();
    if (collections && typeof collections.loadSaved === 'function') {
      return collections.loadSaved(reset, deps || {});
    }
    return Promise.resolve();
  }

  function _loadActivities(deps) {
    if (deps && typeof deps.loadActivities === 'function') return deps.loadActivities();
    var collections = getCollections();
    if (collections && typeof collections.loadActivities === 'function') {
      return collections.loadActivities(deps || {});
    }
    return Promise.resolve();
  }

  function _switchTab(tabId, deps) {
    if (deps && typeof deps.switchTab === 'function') {
      deps.switchTab(tabId);
      return;
    }
    var collections = getCollections();
    if (collections && typeof collections.switchTab === 'function') {
      collections.switchTab(tabId, deps || {});
    }
  }

  function _bindTabsAndLists(deps) {
    if (deps && typeof deps.bindTabsAndLists === 'function') {
      deps.bindTabsAndLists();
      return;
    }
    var collections = getCollections();
    if (collections && typeof collections.bindTabsAndLists === 'function') {
      collections.bindTabsAndLists(deps || {});
    }
  }

  function showFatal(message, deps) {
    var loading = select(deps, '#profile-loading');
    var content = select(deps, '#profile-content');
    if (content) content.style.display = 'none';
    if (loading) {
      loading.style.display = 'flex';
      loading.innerHTML = '<i class="fas fa-user-slash"></i> ' + _esc(message, deps);
    }
  }

  function showRestrictedProfile(deps) {
    var loading = select(deps, '#profile-loading');
    var content = select(deps, '#profile-content');
    if (content) content.style.display = 'none';
    if (loading) {
      loading.style.display = 'flex';
      loading.innerHTML = [
        '<div style="display:grid;gap:12px;justify-items:center;max-width:420px;text-align:center;">',
        '<i class="fas fa-user-lock" style="font-size:2rem;color:var(--kc-primary-brand);"></i>',
        '<strong>Este perfil est\u00e1 vis\u00edvel apenas para quem faz parte da comunidade.</strong>',
        '<span>Entre na plataforma para ver esta p\u00e1gina e outros conte\u00fados restritos \u00e0 comunidade KinoCampus.</span>',
        '<a href="/index.html#login" data-kc-login="true" style="display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;background:var(--kc-primary-brand);color:#fff;text-decoration:none;font-weight:700;"><i class="fas fa-right-to-bracket"></i>Entrar na comunidade</a>',
        '</div>'
      ].join('');
    }
  }

  async function loadStats(authorId, deps) {
    var client = _getClient(deps);
    var state = getState(deps);
    if (!authorId) return;

    try {
      if (client) {
        var postQuery = client
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .eq('author_id', authorId);
        if (state.isPublicView) postQuery = postQuery.eq('status', 'published').eq('visibility', 'public');
        var postResult = await postQuery;

        if (typeof postResult.count === 'number') {
          var statPosts = select(deps, '#stat-posts');
          if (statPosts) statPosts.textContent = String(postResult.count);
          _setBadgeCount('#badge-posts', postResult.count, deps);
        }

        var commentResult = await client
          .from('comments')
          .select('id', { count: 'exact', head: true })
          .eq('author_id', authorId);
        if (typeof commentResult.count === 'number') {
          var statComments = select(deps, '#stat-comments');
          if (statComments) statComments.textContent = String(commentResult.count);
          _setBadgeCount('#badge-comments', commentResult.count, deps);
        }

        var voteQuery = client
          .from('posts')
          .select('votos')
          .eq('author_id', authorId)
          .eq('status', 'published');
        if (state.isPublicView) voteQuery = voteQuery.eq('visibility', 'public');
        var voteResult = await voteQuery;
        if (Array.isArray(voteResult.data)) {
          var totalVotes = voteResult.data.reduce(function (sum, item) {
            return sum + (Number(item && item.votos) || 0);
          }, 0);
          var statVotes = select(deps, '#stat-votes');
          if (statVotes) statVotes.textContent = String(totalVotes);
        }
      }

      if (window.KCAPI && typeof window.KCAPI.getUserRatingSummary === 'function') {
        state.ratingSummary = _normalizeRatingSummary(await window.KCAPI.getUserRatingSummary(authorId), authorId, deps);
      } else {
        state.ratingSummary = _getProfileRatingSummaryFromProfile(state.profile || {}, deps);
      }
      _renderProfileRatingSummary(deps);
    } catch (error) {
      console.warn('[Profile] loadStats:', error);
    }
  }

  function setProfilePending(pending, deps) {
    var state = getState(deps);
    state.profilePending = !!pending;
    ['#profile-save-submit', '#profile-edit-cancel', '#profile-edit-toggle', '#profile-avatar-input'].forEach(function (selector) {
      var element = select(deps, selector);
      if (element) element.disabled = state.profilePending;
    });
  }

  async function handleProfileSubmit(event, deps) {
    var state = getState(deps);
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (!_isOwnerView(deps) || state.profilePending) return;

    var nameInput = select(deps, '#display-name-input');
    var bioInput = select(deps, '#profile-bio-input');
    var displayName = String((nameInput && nameInput.value) || '').trim().slice(0, 80);
    var bio = String((bioInput && bioInput.value) || '').trim().slice(0, Number(deps && deps.bioLimit) || 200);

    if (!displayName) {
      _setStatus('Informe um nome v\u00e1lido para o perfil.', 'warn', deps);
      return;
    }

    setProfilePending(true, deps);
    _setStatus('Salvando perfil...', 'info', deps);

    try {
      var patch = { display_name: displayName, bio: bio };
      if (state.avatarFile) {
        var upload = await window.KCAPI.uploadProfileAvatar(state.avatarFile);
        if (!upload || !upload.ok || !upload.data || !upload.data.url) {
          _setStatus((upload && upload.error && upload.error.message) || 'N\u00e3o foi poss\u00edvel enviar sua foto.', 'error', deps);
          return;
        }
        patch.avatar_url = upload.data.url;
      }

      var result = await window.KCAPI.updateMyProfile(patch);
      if (!result || !result.ok) {
        _setStatus((result && result.error && result.error.message) || 'N\u00e3o foi poss\u00edvel atualizar seu perfil.', 'error', deps);
        return;
      }

      state.profile = result.data || state.profile;
      _clearAvatarDraft(deps);
      state.isEditing = false;
      _renderHeader(deps);
      var form = select(deps, '#profile-inline-form');
      if (form && form.classList && typeof form.classList.remove === 'function') {
        form.classList.remove('is-active');
      }
      _setStatus('Perfil atualizado com sucesso.', 'success', deps);
    } catch (error) {
      console.error('[Profile] handleProfileSubmit:', error);
      _setStatus('N\u00e3o foi poss\u00edvel atualizar seu perfil.', 'error', deps);
    } finally {
      setProfilePending(false, deps);
    }
  }

  function handleAvatarChange(event, deps) {
    var state = getState(deps);
    var file = event && event.target && event.target.files && event.target.files[0];
    if (!file) return;

    state.avatarFile = file;
    _releaseAvatarPreview(deps);
    try {
      state.avatarPreviewUrl = URL.createObjectURL(file);
    } catch (_) {
      state.avatarPreviewUrl = '';
    }

    if (!state.isEditing) _setEditing(true, deps);
    _renderHeader(deps);
    _setStatus('Foto pronta para salvar.', 'info', deps);
  }

  function bindProfileEditing(deps) {
    var shared = getShared(deps);
    var editToggle = select(deps, '#profile-edit-toggle');
    if (editToggle && typeof editToggle.addEventListener === 'function') {
      editToggle.addEventListener('click', function () {
        var profile = getState(deps).profile || {};
        var target = shared && typeof shared.isOnboardingComplete === 'function' && !shared.isOnboardingComplete(profile)
          ? _buildAccountSetupHref(deps)
          : _buildSettingsHref(deps);
        window.location.href = target;
      });
    }

    var avatarEdit = select(deps, '#profile-avatar-edit');
    if (avatarEdit && typeof avatarEdit.addEventListener === 'function') {
      avatarEdit.addEventListener('click', function () {
        window.location.href = _buildAccountSetupHref(deps);
      });
    }
  }

  async function loadProfile(deps) {
    var state = getState(deps);
    if (_restoreCachedProfile(deps)) return true;

    try {
      if (state.isPublicView) {
        state.profile = await window.KCAPI.getProfileById(state.profileId);
      } else {
        state.profile = typeof window.KCAPI.getCurrentProfile === 'function'
          ? window.KCAPI.getCurrentProfile()
          : null;
        if (state.profile && state.user && String(state.profile.id || '') !== String(state.user.id || '')) {
          state.profile = null;
        }
        if (!state.profile) {
          state.profile = await window.KCAPI.getMyProfile();
        }
        if (!state.profile && typeof window.KCAPI.syncProfile === 'function') {
          await window.KCAPI.syncProfile();
          state.profile = typeof window.KCAPI.getCurrentProfile === 'function'
            ? window.KCAPI.getCurrentProfile()
            : null;
          if (!state.profile) {
            state.profile = await window.KCAPI.getMyProfile();
          }
        }
      }
    } catch (error) {
      console.warn('[Profile] loadProfile:', error);
      state.profile = null;
    }

    if (!state.profile) return false;

    var client = _getClient(deps);
    if (client && !state.profile.created_at) {
      try {
        var extra = await client
          .from('profiles')
          .select('created_at, bio, avatar_url, display_name, full_name, verified, legacy_id')
          .eq('id', state.profileId)
          .maybeSingle();
        if (extra && extra.data) state.profile = Object.assign({}, state.profile, extra.data);
      } catch (_) { }
    }

    _persistCachedProfile(state.profile, deps);
    _renderHeader(deps);
    return true;
  }

  function bindProfileSyncListener(deps) {
    document.addEventListener('kc:profilechange', function (event) {
      var profile = event && event.detail ? event.detail.profile : null;
      var state = getState(deps);
      if (!profile || !state.profileId || String(profile.id || '') !== String(state.profileId)) return;
      state.profile = Object.assign({}, state.profile || {}, profile);
      _renderHeader(deps);
    });
  }

  async function refreshProfilePage(deps) {
    var state = getState(deps);
    _setStatus('Atualizando perfil...', 'info', deps);
    try {
      state.user = window.KCSupabase && typeof window.KCSupabase.getUser === 'function'
        ? window.KCSupabase.getUser()
        : state.user;
      if (!state.user && window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
        state.user = await window.KCAPI.getCurrentUser();
      }
      state.viewerAuthenticated = !!state.user;

      var loaded = await loadProfile(deps);
      if (!loaded) {
        _setStatus('N\u00e3o foi poss\u00edvel atualizar este perfil agora.', 'error', deps);
        return;
      }

      var tasks = [
        loadStats(state.profileId, deps),
        _loadSavedBadgeCount(state.profileId, deps),
        _loadActivities(deps)
      ];

      if (state.activeTab === 'posts' || state.posts.length) tasks.push(_loadPosts(true, deps));
      if (state.activeTab === 'comments' || state.comments.length) tasks.push(_loadComments(true, deps));
      if (state.activeTab === 'saved' || state.savedItems.length) tasks.push(_loadSaved(true, deps));
      if (state.activeTab === 'ratings' || state.ratings.length) tasks.push(_loadRatings(true, deps));

      await Promise.allSettled(tasks);
      _renderHeader(deps);
      _setStatus('Perfil atualizado.', 'success', deps);
    } catch (error) {
      console.error('[Profile] refresh failed:', error);
      _setStatus('N\u00e3o foi poss\u00edvel atualizar este perfil agora.', 'error', deps);
    }
  }

  function initPullToRefresh(deps) {
    if (!window.KCPullToRefresh || !document.body || document.body.dataset.kcProfilePtrReady === '1') return;
    document.body.dataset.kcProfilePtrReady = '1';
    window.KCPullToRefresh.init({
      container: document.body,
      onRefresh: function () {
        return refreshProfilePage(deps);
      }
    });
  }

  function decorateRankingBadges(profileId) {
    if (!profileId || !window.KCAPI || typeof window.KCAPI.getTopContributors !== 'function') return;
    var modules = [null, 'compra-venda', 'moradia', 'caronas', 'eventos', 'oportunidades', 'achados-perdidos'];
    modules.forEach(function (mod) {
      window.KCAPI.getTopContributors('month', mod, 10).then(function (users) {
        if (users && users.length && window.KCRanking) {
          window.KCRanking.decorateAuthorAvatars(users, mod);
        }
      }).catch(function () {});
    });
  }

  async function init(deps) {
    var state = getState(deps);
    if (!window.KCAPI || typeof window.KCAPI.getCurrentUser !== 'function') return;

    var queryId = _readProfileIdFromQuery(deps);
    state.user = window.KCSupabase && typeof window.KCSupabase.getUser === 'function'
      ? window.KCSupabase.getUser()
      : null;
    if (!state.user) {
      state.user = await window.KCAPI.getCurrentUser();
    }
    state.viewerAuthenticated = !!state.user;

    if (queryId) {
      if (state.user && String(state.user.id) === String(queryId)) {
        state.isPublicView = false;
        state.profileId = state.user.id;
      } else {
        state.isPublicView = true;
        state.profileId = queryId;
      }
    } else {
      if (!state.user) {
        showFatal('Voc\u00ea precisa estar logado para ver seu perfil.', deps);
        setTimeout(function () {
          window.location.href = 'index.html#login';
        }, 900);
        return;
      }
      state.isPublicView = false;
      state.profileId = state.user.id;
    }

    var loaded = await loadProfile(deps);
    if (!loaded) {
      if (state.isPublicView && !state.viewerAuthenticated) {
        var restricted = await _probeRestrictedProfile(state.profileId, deps);
        if (restricted) {
          state.restrictedProfile = true;
          showRestrictedProfile(deps);
          return;
        }
      }
      showFatal(state.isPublicView ? 'Perfil n\u00e3o encontrado.' : 'N\u00e3o foi poss\u00edvel carregar seu perfil.', deps);
      return;
    }

    var loading = select(deps, '#profile-loading');
    if (loading) loading.style.display = 'none';
    var content = select(deps, '#profile-content');
    if (content) content.style.display = 'block';

    _bindTabsAndLists(deps);
    bindProfileEditing(deps);
    bindProfileSyncListener(deps);

    loadStats(state.profileId, deps).catch(function () {});
    _loadSavedBadgeCount(state.profileId, deps).catch(function () {});
    _loadActivities(deps).catch(function () {});
    _renderHeader(deps);
    _switchTab('activities', deps);
    initPullToRefresh(deps);
    decorateRankingBadges(state.profileId);
  }

  window._KCPR.flow = Object.freeze({
    bindProfileEditing: bindProfileEditing,
    bindProfileSyncListener: bindProfileSyncListener,
    handleAvatarChange: handleAvatarChange,
    handleProfileSubmit: handleProfileSubmit,
    init: init,
    initPullToRefresh: initPullToRefresh,
    loadProfile: loadProfile,
    loadStats: loadStats,
    refreshProfilePage: refreshProfilePage,
    setProfilePending: setProfilePending
  });
})();
