/* KinoCampus - Local Profile Adapter */
(function () {
  'use strict';

  var LOCAL_PROFILE_STORAGE_KEY = 'kc_local_profile';
  var DEFAULT_VIEWER_ID = 'USER_SELF';

  window._KCLA = window._KCLA || {};

  function getViewerId(deps) {
    return String((deps && deps.viewerId) || DEFAULT_VIEWER_ID).trim() || DEFAULT_VIEWER_ID;
  }

  function getMockUsersById(deps) {
    if (deps && deps.mockUsersById && typeof deps.mockUsersById === 'object') return deps.mockUsersById;
    return (window.KCAPI && window.KCAPI.MOCK_USERS_BY_ID && typeof window.KCAPI.MOCK_USERS_BY_ID === 'object')
      ? window.KCAPI.MOCK_USERS_BY_ID
      : {};
  }

  function getNowIsoFn(deps) {
    return (deps && typeof deps.getNowIso === 'function')
      ? deps.getNowIso
      : function () { return new Date().toISOString(); };
  }

  function buildDefaultProfile(deps) {
    var viewerId = getViewerId(deps);
    var mockUsersById = getMockUsersById(deps);
    var viewer = mockUsersById[viewerId] || {};
    var displayName = String(viewer.displayName || viewer.name || 'Voce').trim() || 'Voce';
    var avatarUrl = String(viewer.avatarUrl || viewer.avatar || '').trim() || null;
    return {
      id: String(viewer.id || viewerId).trim() || viewerId,
      display_name: displayName,
      avatar_url: avatarUrl,
      avatar_path: null,
      bio: '',
      affiliation: '',
      gender_identity: '',
      gender_identity_custom: '',
      race_color: '',
      contact_primary_method: null,
      contact_cta_enabled: true,
      social_links: {},
      social_visibility: {},
      profile_public: true,
      onboarding_completed: false,
      verified: true,
      email: String(viewer.email || '').trim() || null,
    };
  }

  function readProfile(deps) {
    var fallback = buildDefaultProfile(deps);
    try {
      var raw = localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
      return {
        ...fallback,
        ...parsed,
        id: String(parsed.id || fallback.id || DEFAULT_VIEWER_ID).trim() || DEFAULT_VIEWER_ID,
        display_name: String(parsed.display_name || fallback.display_name || 'Voce').trim() || 'Voce',
        avatar_url: String(parsed.avatar_url || fallback.avatar_url || '').trim() || null,
      };
    } catch (_) {
      return fallback;
    }
  }

  function writeProfile(profile, deps) {
    var next = {
      ...buildDefaultProfile(deps),
      ...(profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {}),
    };
    try {
      localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(next));
      return next;
    } catch (_) {
      return null;
    }
  }

  function syncProfile(profile) {
    if (window.KCProfiles && typeof window.KCProfiles.commitProfile === 'function') {
      try {
        return window.KCProfiles.commitProfile(profile);
      } catch (_) { }
    }
    try {
      if (typeof document !== 'undefined' && document && typeof document.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        document.dispatchEvent(new CustomEvent('kc:profilechange', { detail: { profile: profile || null } }));
      }
    } catch (_) { }
    return profile || null;
  }

  async function getMyProfile(deps) {
    return readProfile(deps);
  }

  async function updateMyProfile(patch, deps) {
    if (patch === undefined) patch = {};
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return { ok: false, error: { message: 'Patch de perfil invalido.' } };
    }
    if (!Object.keys(patch).length) {
      return { ok: false, error: { message: 'Nenhuma alteracao informada.' } };
    }

    var current = readProfile(deps);
    if (Object.prototype.hasOwnProperty.call(patch, 'display_name') && !String(patch.display_name || '').trim()) {
      return { ok: false, error: { message: 'Informe um nome valido.' } };
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'avatar_url')) {
      var avatarUrl = String(patch.avatar_url || '').trim();
      if (avatarUrl && !/^(https?:\/\/|data:|blob:)/i.test(avatarUrl)) {
        return { ok: false, error: { message: 'URL de avatar invalida.' } };
      }
    }

    var next = {
      ...current,
      ...patch,
      id: current.id || getViewerId(deps),
      updated_at: getNowIsoFn(deps)(),
    };
    var saved = writeProfile(next, deps);
    if (!saved) {
      return { ok: false, error: { message: 'Nao foi possivel salvar o perfil localmente.' } };
    }
    syncProfile(saved);
    return { ok: true, data: saved };
  }

  async function uploadProfileAvatar(fileOrDataUrl) {
    if (typeof fileOrDataUrl === 'string') {
      var value = String(fileOrDataUrl || '').trim();
      if (/^(https?:\/\/|data:|blob:)/i.test(value)) {
        return { ok: true, data: { url: value, path: null } };
      }
      if (value) {
        return { ok: false, error: { message: 'Formato de avatar invalido.' } };
      }
    }

    if (typeof FileReader !== 'undefined' && fileOrDataUrl && typeof fileOrDataUrl === 'object') {
      return new Promise(function (resolve) {
        try {
          var reader = new FileReader();
          reader.onload = function () {
            resolve({ ok: true, data: { url: String(reader.result || ''), path: null } });
          };
          reader.onerror = function () {
            resolve({ ok: false, error: { message: 'Nao foi possivel ler o avatar selecionado.' } });
          };
          reader.readAsDataURL(fileOrDataUrl);
        } catch (_) {
          resolve({ ok: false, error: { message: 'Nao foi possivel processar o avatar selecionado.' } });
        }
      });
    }

    return { ok: false, error: { message: 'Upload de avatar indisponivel no modo local.' } };
  }

  window._KCLA.profile = Object.freeze({
    readProfile: readProfile,
    getMyProfile: getMyProfile,
    updateMyProfile: updateMyProfile,
    uploadProfileAvatar: uploadProfileAvatar,
  });
}());
