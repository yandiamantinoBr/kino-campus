'use strict';

const fs = require('fs');
const path = require('path');

const MODULE_PATH = path.resolve(__dirname, '../assets/js/controllers/profile.flow.js');
const CONTROLLER_PATH = path.resolve(__dirname, '../assets/js/controllers/profile.controller.js');
const HTML_PATH = path.resolve(__dirname, '../profile.html');

let moduleSource;
let controllerSource;
let htmlSource;

function createClassList() {
  const values = new Set();
  return {
    add(name) {
      values.add(String(name));
    },
    remove(name) {
      values.delete(String(name));
    },
    toggle(name, force) {
      if (force === undefined) {
        if (values.has(name)) {
          values.delete(name);
          return false;
        }
        values.add(name);
        return true;
      }
      if (force) values.add(name);
      else values.delete(name);
      return !!force;
    },
    contains(name) {
      return values.has(String(name));
    }
  };
}

function createElement(initial) {
  const listeners = {};
  return Object.assign({
    disabled: false,
    innerHTML: '',
    textContent: '',
    value: '',
    style: {},
    dataset: {},
    classList: createClassList(),
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    getListener(type) {
      return listeners[type] || null;
    }
  }, initial || {});
}

function resetRuntime() {
  jest.resetModules();
  global.window = global;
  global.document = {
    body: { dataset: {} },
    querySelector() {
      return null;
    },
    addEventListener: jest.fn()
  };
  global.URL = {
    createObjectURL: jest.fn(() => 'blob:avatar'),
    revokeObjectURL: jest.fn()
  };
  delete window._KCPR;
  delete window.KCAPI;
  delete window.KCSupabase;
  delete window.KCPullToRefresh;
  delete window.KCRanking;
}

function loadFlowModule() {
  require(MODULE_PATH);
  return window._KCPR.flow;
}

function createDeps(overrides) {
  const config = overrides || {};
  const elements = config.elements || {};
  const state = Object.assign({
    user: { id: 'user-1' },
    profile: { id: 'user-1', display_name: 'Yan' },
    profileId: 'user-1',
    isPublicView: false,
    viewerAuthenticated: true,
    restrictedProfile: false,
    activeTab: 'activities',
    isEditing: false,
    profilePending: false,
    avatarFile: null,
    avatarPreviewUrl: '',
    posts: [],
    comments: [],
    savedItems: [],
    ratings: [],
    ratingSummary: { average: null, count: 0 }
  }, config.state || {});

  const deps = {
    $: (selector) => elements[selector] || null,
    bioLimit: 200,
    bindTabsAndLists: jest.fn(),
    buildAccountSetupHref: jest.fn(() => '/account-setup.html?next=profile'),
    buildSettingsHref: jest.fn(() => '/settings.html?next=profile'),
    clearAvatarDraft: jest.fn(() => {
      state.avatarFile = null;
      state.avatarPreviewUrl = '';
    }),
    esc: jest.fn((value) => String(value == null ? '' : value)),
    getClient: jest.fn(() => null),
    getProfileRatingSummaryFromProfile: jest.fn(() => ({ average: null, count: 0 })),
    isOwnerView: jest.fn(() => !state.isPublicView),
    loadActivities: jest.fn(() => Promise.resolve()),
    loadComments: jest.fn(() => Promise.resolve()),
    loadPosts: jest.fn(() => Promise.resolve()),
    loadRatings: jest.fn(() => Promise.resolve()),
    loadSaved: jest.fn(() => Promise.resolve()),
    loadSavedBadgeCount: jest.fn(() => Promise.resolve()),
    normalizeRatingSummary: jest.fn((raw, fallbackUserId) => ({
      userId: fallbackUserId || (raw && raw.userId) || null,
      average: raw && raw.average != null ? Number(raw.average) : null,
      count: Math.max(0, Number(raw && (raw.count != null ? raw.count : raw.rating_count)) || 0)
    })),
    persistCachedProfile: jest.fn(),
    probeRestrictedProfile: jest.fn(() => Promise.resolve(false)),
    readProfileIdFromQuery: jest.fn(() => ''),
    releaseAvatarPreview: jest.fn(),
    renderHeader: jest.fn(),
    renderProfileRatingSummary: jest.fn(),
    restoreCachedProfile: jest.fn(() => false),
    setBadgeCount: jest.fn(),
    setEditing: jest.fn((active) => {
      state.isEditing = !!active;
    }),
    setStatus: jest.fn(),
    shared: {
      isOnboardingComplete: jest.fn(() => true)
    },
    state,
    switchTab: jest.fn()
  };

  return Object.assign(deps, config, { state });
}

beforeAll(() => {
  moduleSource = fs.readFileSync(MODULE_PATH, 'utf8');
  controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  htmlSource = fs.readFileSync(HTML_PATH, 'utf8');
});

beforeEach(() => {
  resetRuntime();
});

afterEach(() => {
  resetRuntime();
});

describe('profile.flow.js - contrato estatico', () => {
  test('mantem IIFE, use strict e namespace window._KCPR.flow', () => {
    expect(moduleSource).toMatch(/\(function\s*\(\)\s*\{/);
    expect(moduleSource).toContain("'use strict';");
    expect(moduleSource).toContain('window._KCPR = window._KCPR || {};');
    expect(moduleSource).toContain('window._KCPR.flow = Object.freeze({');
  });

  test('nao usa require/import em runtime', () => {
    expect(moduleSource).not.toMatch(/require\s*\(/);
    expect(moduleSource).not.toMatch(/import\s+/);
  });

  test('expoe 10 chaves publicas e o namespace fica frozen', () => {
    const flow = loadFlowModule();

    expect(Object.isFrozen(flow)).toBe(true);
    expect(Object.keys(flow).sort()).toEqual([
      'bindProfileEditing',
      'bindProfileSyncListener',
      'handleAvatarChange',
      'handleProfileSubmit',
      'init',
      'initPullToRefresh',
      'loadProfile',
      'loadStats',
      'refreshProfilePage',
      'setProfilePending'
    ]);
  });
});

describe('profile.controller.js - contrato do split flow', () => {
  test('mantem namespace e builder de dependencias do submodulo', () => {
    expect(controllerSource).toContain('window._KCPR.flow = window._KCPR.flow || {};');
    expect(controllerSource).toContain('function getProfileFlowModule() {');
    expect(controllerSource).toContain('function buildFlowDeps() {');
    expect(controllerSource).toContain('bioLimit: BIO_LIMIT');
    expect(controllerSource).toContain('restoreCachedProfile,');
    expect(controllerSource).toContain('persistCachedProfile,');
    expect(controllerSource).toContain('probeRestrictedProfile,');
  });

  test('delega dominio flow para window._KCPR.flow', () => {
    expect(controllerSource).toContain('flow.loadStats(authorId, buildFlowDeps())');
    expect(controllerSource).toContain('flow.setProfilePending(pending, buildFlowDeps())');
    expect(controllerSource).toContain('flow.handleProfileSubmit(event, buildFlowDeps())');
    expect(controllerSource).toContain('flow.handleAvatarChange(event, buildFlowDeps())');
    expect(controllerSource).toContain('flow.bindProfileEditing(buildFlowDeps())');
    expect(controllerSource).toContain('flow.loadProfile(buildFlowDeps())');
    expect(controllerSource).toContain('flow.bindProfileSyncListener(buildFlowDeps())');
    expect(controllerSource).toContain('flow.refreshProfilePage(buildFlowDeps())');
    expect(controllerSource).toContain('flow.initPullToRefresh(buildFlowDeps())');
    expect(controllerSource).toContain('flow.init(buildFlowDeps())');
  });

  test('removeu corpos inline privados do lifecycle no controller', () => {
    expect(controllerSource).not.toContain('function showFatal(message)');
    expect(controllerSource).not.toContain('function showRestrictedProfile()');
    expect(controllerSource).not.toContain('window.KCAPI.uploadProfileAvatar(state.avatarFile)');
    expect(controllerSource).not.toContain('if (restoreCachedProfile()) return true;');
    expect(controllerSource).not.toContain('window.KCPullToRefresh.init({');
  });
});

describe('profile.html - ordem canonica dos scripts do split flow', () => {
  test('carrega presentation -> collections -> ratings -> flow -> controller', () => {
    const orderedScripts = [
      '<script defer src="assets/js/kc-ranking.js"></script>',
      '<script defer src="assets/js/controllers/profile.presentation.js"></script>',
      '<script defer src="assets/js/controllers/profile.collections.js"></script>',
      '<script defer src="assets/js/controllers/profile.ratings.js"></script>',
      '<script defer src="assets/js/controllers/profile.flow.js"></script>',
      '<script defer src="assets/js/controllers/profile.controller.js"></script>'
    ];

    let lastIndex = -1;
    orderedScripts.forEach((scriptTag) => {
      const currentIndex = htmlSource.indexOf(scriptTag);
      expect(currentIndex).toBeGreaterThan(lastIndex);
      lastIndex = currentIndex;
    });
  });
});

describe('window._KCPR.flow - comportamento', () => {
  test('setProfilePending atualiza estado e desabilita botoes do form', () => {
    const flow = loadFlowModule();
    const elements = {
      '#profile-save-submit': createElement(),
      '#profile-edit-cancel': createElement(),
      '#profile-edit-toggle': createElement(),
      '#profile-avatar-input': createElement()
    };
    const deps = createDeps({ elements });

    flow.setProfilePending(true, deps);

    expect(deps.state.profilePending).toBe(true);
    expect(elements['#profile-save-submit'].disabled).toBe(true);
    expect(elements['#profile-edit-cancel'].disabled).toBe(true);
    expect(elements['#profile-edit-toggle'].disabled).toBe(true);
    expect(elements['#profile-avatar-input'].disabled).toBe(true);
  });

  test('handleAvatarChange guarda arquivo, atualiza preview e status', () => {
    const flow = loadFlowModule();
    const file = { name: 'avatar.png' };
    const deps = createDeps({ state: { isEditing: false } });

    flow.handleAvatarChange({ target: { files: [file] } }, deps);

    expect(deps.state.avatarFile).toBe(file);
    expect(deps.releaseAvatarPreview).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    expect(deps.state.avatarPreviewUrl).toBe('blob:avatar');
    expect(deps.setEditing).toHaveBeenCalledWith(true);
    expect(deps.renderHeader).toHaveBeenCalledTimes(1);
    expect(deps.setStatus).toHaveBeenCalledWith('Foto pronta para salvar.', 'info');
  });

  test('bindProfileEditing navega para account setup ou settings', () => {
    const flow = loadFlowModule();
    const editToggle = createElement();
    const avatarEdit = createElement();
    const deps = createDeps({
      elements: {
        '#profile-edit-toggle': editToggle,
        '#profile-avatar-edit': avatarEdit
      },
      buildAccountSetupHref: jest.fn(() => '#account-setup'),
      buildSettingsHref: jest.fn(() => '#settings'),
      shared: {
        isOnboardingComplete: jest.fn(() => false)
      }
    });

    flow.bindProfileEditing(deps);
    editToggle.getListener('click')();
    expect(window.location.hash).toBe('#account-setup');

    deps.shared.isOnboardingComplete.mockReturnValue(true);
    editToggle.getListener('click')();
    expect(window.location.hash).toBe('#settings');

    avatarEdit.getListener('click')();
    expect(window.location.hash).toBe('#account-setup');
  });

  test('loadProfile retorna cache antes de chamar API', async () => {
    const flow = loadFlowModule();
    window.KCAPI = {
      getProfileById: jest.fn(),
      getCurrentProfile: jest.fn(),
      getMyProfile: jest.fn()
    };
    const deps = createDeps({
      restoreCachedProfile: jest.fn(() => true)
    });

    await expect(flow.loadProfile(deps)).resolves.toBe(true);

    expect(deps.restoreCachedProfile).toHaveBeenCalledTimes(1);
    expect(window.KCAPI.getProfileById).not.toHaveBeenCalled();
    expect(window.KCAPI.getCurrentProfile).not.toHaveBeenCalled();
    expect(window.KCAPI.getMyProfile).not.toHaveBeenCalled();
  });

  test('refreshProfilePage executa os loaders esperados', async () => {
    const flow = loadFlowModule();
    window.KCAPI = {};
    const deps = createDeps({
      state: {
        user: { id: 'user-1' },
        profileId: 'user-1',
        profile: { id: 'user-1' },
        activeTab: 'ratings',
        posts: [{ id: 'post-1' }],
        comments: [{ id: 'comment-1' }],
        savedItems: [{ id: 'saved-1' }],
        ratings: [{ id: 'rating-1' }]
      },
      restoreCachedProfile: jest.fn(() => true)
    });

    await flow.refreshProfilePage(deps);

    expect(deps.setStatus).toHaveBeenCalledWith('Atualizando perfil...', 'info');
    expect(deps.loadSavedBadgeCount).toHaveBeenCalledWith('user-1');
    expect(deps.loadActivities).toHaveBeenCalledTimes(1);
    expect(deps.loadPosts).toHaveBeenCalledWith(true);
    expect(deps.loadComments).toHaveBeenCalledWith(true);
    expect(deps.loadSaved).toHaveBeenCalledWith(true);
    expect(deps.loadRatings).toHaveBeenCalledWith(true);
    expect(deps.renderHeader).toHaveBeenCalled();
    expect(deps.setStatus).toHaveBeenCalledWith('Perfil atualizado.', 'success');
  });

  test('initPullToRefresh registra callback de refresh', () => {
    const flow = loadFlowModule();
    window.KCPullToRefresh = { init: jest.fn() };
    const deps = createDeps();

    flow.initPullToRefresh(deps);

    expect(document.body.dataset.kcProfilePtrReady).toBe('1');
    expect(window.KCPullToRefresh.init).toHaveBeenCalledWith({
      container: document.body,
      onRefresh: expect.any(Function)
    });
  });

  test('init resolve fluxo proprio e prepara a pagina', async () => {
    const flow = loadFlowModule();
    const loading = createElement({ style: { display: 'flex' } });
    const content = createElement({ style: { display: 'none' } });
    const editToggle = createElement();
    const deps = createDeps({
      elements: {
        '#profile-loading': loading,
        '#profile-content': content,
        '#profile-edit-toggle': editToggle
      },
      state: {
        user: null,
        profile: { id: 'user-1' },
        profileId: '',
        isPublicView: false,
        viewerAuthenticated: false
      },
      restoreCachedProfile: jest.fn(() => true)
    });
    window.KCAPI = {
      getCurrentUser: jest.fn(() => Promise.resolve({ id: 'user-1' }))
    };

    await flow.init(deps);

    expect(deps.state.viewerAuthenticated).toBe(true);
    expect(deps.state.isPublicView).toBe(false);
    expect(deps.state.profileId).toBe('user-1');
    expect(loading.style.display).toBe('none');
    expect(content.style.display).toBe('block');
    expect(deps.bindTabsAndLists).toHaveBeenCalledTimes(1);
    expect(deps.switchTab).toHaveBeenCalledWith('activities');
    expect(deps.renderHeader).toHaveBeenCalled();
  });
});
