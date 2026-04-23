'use strict';

const fs = require('fs');
const path = require('path');

const MODULE_PATH = path.resolve(__dirname, '../assets/js/controllers/profile.presentation.js');
const CONTROLLER_PATH = path.resolve(__dirname, '../assets/js/controllers/profile.controller.js');
const HTML_PATH = path.resolve(__dirname, '../profile.html');

let moduleSource;
let controllerSource;
let htmlSource;

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
  const attributes = {};
  const listeners = {};
  const element = Object.assign({
    innerHTML: '',
    textContent: '',
    value: '',
    src: '',
    alt: '',
    style: {},
    dataset: {},
    classList: createClassList(),
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    getListener(type) {
      return listeners[type] || null;
    },
    insertAdjacentHTML(position, html) {
      if (position === 'beforeend') this.innerHTML += String(html);
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    querySelector() {
      return null;
    }
  }, initial || {});
  return element;
}

function installDocument(elements) {
  global.document = {
    title: '',
    body: { dataset: {} },
    querySelector(selector) {
      return elements[selector] || null;
    },
    addEventListener() {}
  };
  return global.document;
}

function resetRuntime() {
  jest.resetModules();
  global.window = global;
  global.document = {
    title: '',
    body: { dataset: {} },
    querySelector() { return null; },
    addEventListener() {}
  };
  delete window._KCPR;
  delete window.KCUtils;
  delete window.KCAccountProfileUtils;
}

function loadPresentationModule() {
  require(MODULE_PATH);
  return window._KCPR.presentation;
}

function createSharedMocks() {
  return {
    normalizeNextPath: jest.fn((nextPath) => nextPath),
    formatProfileValue: jest.fn((field, value) => {
      if (field === 'affiliation' && value === 'student') return 'Estudante';
      return String(value || '').trim();
    }),
    getVisibleSocialLinks: jest.fn((profile) => profile.links || []),
    buildDefaultAvatarDataUrl: jest.fn((name) => 'data:image/svg+xml,' + encodeURIComponent(name)),
    isOnboardingComplete: jest.fn((profile) => !!(profile && profile.onboardingComplete))
  };
}

beforeAll(() => {
  moduleSource = fs.readFileSync(MODULE_PATH, 'utf8');
  controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  htmlSource = fs.readFileSync(HTML_PATH, 'utf8');
});

beforeEach(() => {
  resetRuntime();
  window.KCUtils = {
    escapeHtml,
    buildPublicHandle(value) {
      const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      return normalized ? ('@' + normalized) : '';
    },
    buildProductDetailHref(postId) {
      return '_product.html?id=' + encodeURIComponent(String(postId || '').trim());
    }
  };
  window.KCAccountProfileUtils = createSharedMocks();
});

afterEach(() => {
  resetRuntime();
});

describe('profile.presentation.js - contrato estatico', () => {
  test('mantem IIFE, use strict e namespace window._KCPR.presentation', () => {
    expect(moduleSource).toMatch(/\(function\s*\(\)\s*\{/);
    expect(moduleSource).toContain("'use strict';");
    expect(moduleSource).toContain('window._KCPR = window._KCPR || {}');
    expect(moduleSource).toContain('window._KCPR.presentation = Object.freeze({');
  });

  test('nao usa require/import em runtime', () => {
    expect(moduleSource).not.toMatch(/require\s*\(/);
    expect(moduleSource).not.toMatch(/import\s+/);
  });

  test('expoe 28 chaves publicas e o namespace fica frozen', () => {
    const presentation = loadPresentationModule();
    expect(Object.isFrozen(presentation)).toBe(true);
    expect(Object.keys(presentation).sort()).toEqual([
      'buildAccountSetupHref',
      'buildPostDetailHref',
      'buildPublicHandle',
      'buildRatingStars',
      'buildSaveBadges',
      'buildSettingsHref',
      'currentAvatarUrl',
      'esc',
      'fmtDate',
      'fmtRelative',
      'formatChoice',
      'getProfileRatingSummaryFromProfile',
      'getProfileVisibleSocialLinks',
      'linkifyBio',
      'normalizeRatingSummary',
      'normalizeSaveKinds',
      'renderHeader',
      'renderProfileRatingSummary',
      'safeHandle',
      'safeName',
      'saveKindBadge',
      'setBadgeCount',
      'setEditing',
      'setStatus',
      'statusBadge',
      'syncFormFromProfile',
      'updateBioCounter',
      'visibilityBadge'
    ]);
  });
});

describe('profile.controller.js - contrato do split presentation', () => {
  test('mantem os guards do namespace e o builder de deps', () => {
    expect(controllerSource).toContain('window._KCPR = window._KCPR || {};');
    expect(controllerSource).toContain('window._KCPR.presentation = window._KCPR.presentation || {};');
    expect(controllerSource).toContain('function buildPresentationDeps() {');
    expect(controllerSource).toContain('bioLimit: BIO_LIMIT');
    expect(controllerSource).toContain('clearAvatarDraft,');
    expect(controllerSource).toContain('isOwnerView,');
    expect(controllerSource).toContain('shared,');
    expect(controllerSource).toContain('state,');
  });

  test('delega helpers e renderizacao para window._KCPR.presentation', () => {
    expect(controllerSource).toContain("presentation.safeHandle(profile, user, buildPresentationDeps())");
    expect(controllerSource).toContain("presentation.buildAccountSetupHref(buildPresentationDeps())");
    expect(controllerSource).toContain("presentation.formatChoice(field, value, buildPresentationDeps())");
    expect(controllerSource).toContain("presentation.renderProfileRatingSummary(buildPresentationDeps())");
    expect(controllerSource).toContain("presentation.setEditing(active, buildPresentationDeps())");
    expect(controllerSource).toContain("presentation.renderHeader(buildPresentationDeps())");
  });

  test('removeu o corpo inline antigo do header', () => {
    expect(controllerSource).not.toContain('const savedEmptyText = state.isPublicView');
    expect(controllerSource).not.toContain("document.title = name + ' — Perfil KinoCampus';");
    expect(controllerSource).not.toContain("const visibleLinks = getProfileVisibleSocialLinks(profile);");
    expect(controllerSource).not.toContain("setupHint.innerHTML = `Complete seus links e preferências");
  });
});

describe('profile.html - ordem canonica dos scripts do split', () => {
  test('carrega ranking -> presentation -> controller no final da pagina', () => {
    const orderedScripts = [
      '<script defer src="assets/js/account-profile.shared.js"></script>',
      '<script defer src="assets/js/kc-comments.js"></script>',
      '<script defer src="assets/js/kc-profiles.client.js"></script>',
      '<script defer src="assets/js/kc-pull-to-refresh.js"></script>',
      '<script defer src="assets/js/kc-public-shell.js"></script>',
      '<script defer src="assets/js/kc-auth.ui.js"></script>',
      '<script defer src="assets/js/kc-notifications.js"></script>',
      '<script defer src="assets/js/kc-theme.js"></script>',
      '<script defer src="assets/js/kc-ranking.js"></script>',
      '<script defer src="assets/js/controllers/profile.presentation.js"></script>',
      '<script defer src="assets/js/controllers/profile.collections.js"></script>',
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

describe('window._KCPR.presentation - comportamento', () => {
  test('safeName e safeHandle respeitam email do dono e handle publico', () => {
    const presentation = loadPresentationModule();

    expect(presentation.safeName({}, { email: 'yan@example.com' })).toBe('yan');
    expect(presentation.safeHandle({}, { email: 'yan@example.com' }, { state: { isPublicView: false } })).toBe('@yan');
    expect(
      presentation.safeHandle({ display_name: 'Yan Silva' }, { email: 'yan@example.com' }, { state: { isPublicView: true } })
    ).toBe('@yan-silva');
  });

  test('buildAccountSetupHref e buildSettingsHref preservam next do perfil', () => {
    const presentation = loadPresentationModule();
    const shared = createSharedMocks();
    const deps = {
      state: { profileId: 'abc-123' },
      shared
    };

    expect(presentation.buildAccountSetupHref(deps)).toBe('/account-setup.html?next=%2Fprofile.html%3Fid%3Dabc-123');
    expect(presentation.buildSettingsHref(deps)).toBe('/settings.html?next=%2Fprofile.html%3Fid%3Dabc-123');
    expect(shared.normalizeNextPath).toHaveBeenCalledWith('/profile.html?id=abc-123', '/profile.html');
  });

  test('normalizeSaveKinds deduplica e buildSaveBadges gera as badges', () => {
    const presentation = loadPresentationModule();

    expect(presentation.normalizeSaveKinds(['favorite', 'later', 'favorite', 'invalid'])).toEqual(['favorite', 'later']);
    expect(presentation.buildSaveBadges(['favorite', 'highlight'])).toContain('Favorito');
    expect(presentation.buildSaveBadges(['favorite', 'highlight'])).toContain('Destaque');
  });

  test('linkifyBio escapa HTML e linkifica URLs', () => {
    const presentation = loadPresentationModule();
    const html = presentation.linkifyBio('Oi <b>teste</b> https://kino.example');

    expect(html).toContain('&lt;b&gt;teste&lt;/b&gt;');
    expect(html).toContain('href="https://kino.example"');
  });

  test('syncFormFromProfile replica perfil no form e atualiza contador', () => {
    const presentation = loadPresentationModule();
    const nameInput = createElement();
    const bioInput = createElement({ value: '' });
    const counter = createElement();
    const elements = {
      '#display-name-input': nameInput,
      '#profile-bio-input': bioInput,
      '#profile-bio-counter': counter
    };
    installDocument(elements);

    presentation.syncFormFromProfile({
      bioLimit: 200,
      state: {
        profile: {
          display_name: 'Yan',
          bio: 'Bio curta'
        }
      },
      $: (selector) => elements[selector] || null
    });

    expect(nameInput.value).toBe('Yan');
    expect(bioInput.value).toBe('Bio curta');
    expect(counter.textContent).toBe('9/200');
  });

  test('renderProfileRatingSummary atualiza KPI e badge', () => {
    const presentation = loadPresentationModule();
    const statValue = createElement();
    const statLabel = createElement();
    const badge = createElement();
    const elements = {
      '#stat-rating': statValue,
      '#stat-rating-label': statLabel,
      '#badge-ratings': badge
    };
    installDocument(elements);

    presentation.renderProfileRatingSummary({
      state: {
        profileId: 'user-1',
        profile: { id: 'user-1' },
        ratingSummary: { average: 4.25, count: 8 }
      },
      $: (selector) => elements[selector] || null
    });

    expect(statValue.textContent).toBe('4.3');
    expect(statLabel.textContent).toBe('Reputação (8)');
    expect(badge.textContent).toBe('8');
  });

  test('renderHeader atualiza avatar, titulo, links sociais e textos do owner view', () => {
    const presentation = loadPresentationModule();
    const memberSinceInner = createElement();
    const memberSince = createElement({
      querySelector(selector) {
        return selector === 'span' ? memberSinceInner : null;
      }
    });
    const avatar = createElement();
    const avatarWrap = createElement();
    const verifiedIcon = createElement();
    const avatarEdit = createElement();
    const editToggle = createElement();
    const nameEl = createElement();
    const legacyBadge = createElement();
    const handleEl = createElement();
    const bio = createElement();
    const meta = createElement();
    const contextPills = createElement();
    const socialLinksWrap = createElement();
    const setupHint = createElement();
    const displayNameInput = createElement();
    const bioInput = createElement();
    const bioCounter = createElement();
    const savedTabLabel = createElement();
    const savedToolbarTitle = createElement();
    const savedKind = createElement({ value: '' });
    const postsStatus = createElement();
    const savedEmpty = createElement();
    const statValue = createElement();
    const statLabel = createElement();
    const badgeRatings = createElement();

    const elements = {
      '#profile-avatar': avatar,
      '#profileAvatarWrap': avatarWrap,
      '#profile-verified-icon': verifiedIcon,
      '#profile-avatar-edit': avatarEdit,
      '#profile-edit-toggle': editToggle,
      '#profile-display-name': nameEl,
      '#profile-legacy-badge': legacyBadge,
      '#profile-handle': handleEl,
      '#profile-member-since': memberSince,
      '#profile-bio': bio,
      '.kc-profile-meta': meta,
      '#profile-context-pills': contextPills,
      '#profile-social-links': socialLinksWrap,
      '#profile-setup-hint': setupHint,
      '#display-name-input': displayNameInput,
      '#profile-bio-input': bioInput,
      '#profile-bio-counter': bioCounter,
      '#saved-tab-label': savedTabLabel,
      '#saved-toolbar-title': savedToolbarTitle,
      '#profile-saved-kind': savedKind,
      '#profile-posts-status': postsStatus,
      '#saved-empty': savedEmpty,
      '#stat-rating': statValue,
      '#stat-rating-label': statLabel,
      '#badge-ratings': badgeRatings
    };
    installDocument(elements);

    presentation.renderHeader({
      bioLimit: 200,
      $: (selector) => elements[selector] || null,
      clearAvatarDraft: jest.fn(),
      isOwnerView() {
        return true;
      },
      shared: {
        normalizeNextPath(nextPath) { return nextPath; },
        formatProfileValue(field, value) {
          return field === 'affiliation' && value === 'student' ? 'Estudante' : String(value || '');
        },
        getVisibleSocialLinks() {
          return [{
            key: 'instagram',
            href: 'https://instagram.com/yan',
            display: '@yan',
            iconClass: 'fab fa-instagram'
          }];
        },
        buildDefaultAvatarDataUrl(name) {
          return 'data:image/svg+xml,' + encodeURIComponent(name);
        },
        isOnboardingComplete() {
          return true;
        }
      },
      state: {
        isPublicView: false,
        isEditing: false,
        profileId: 'user-1',
        savedKind: 'favorite',
        ratingSummary: { average: 4.2, count: 3 },
        user: { email: 'yan@example.com' },
        profile: {
          id: 'user-1',
          display_name: 'Yan Silva',
          bio: 'Perfil com link https://kino.example',
          avatar_url: 'https://cdn.example/avatar.png',
          verified: true,
          created_at: '2026-01-10T00:00:00.000Z',
          affiliation: 'student',
          onboardingComplete: true
        }
      }
    });

    expect(avatar.src).toBe('https://cdn.example/avatar.png');
    expect(avatar.alt).toBe('Avatar de Yan Silva');
    expect(avatarWrap.dataset.userId).toBe('user-1');
    expect(verifiedIcon.style.display).toBe('flex');
    expect(nameEl.textContent).toBe('Yan Silva');
    expect(global.document.title).toBe('Yan Silva — Perfil KinoCampus');
    expect(handleEl.textContent).toBe('@yan');
    expect(meta.innerHTML).toContain('Estudante');
    expect(socialLinksWrap.innerHTML).toContain('instagram.com/yan');
    expect(setupHint.innerHTML).toContain('configurações');
    expect(savedTabLabel.textContent).toBe('Salvos');
    expect(savedToolbarTitle.textContent).toBe('Salvos');
    expect(savedEmpty.innerHTML).toContain('Nenhuma publicação salva ainda.');
    expect(statLabel.textContent).toBe('Reputação (3)');
  });
});
