'use strict';

const fs = require('fs');
const path = require('path');

const MODULE_PATH = path.resolve(__dirname, '../../assets/js/controllers/profile.ratings.js');
const CONTROLLER_PATH = path.resolve(__dirname, '../../assets/js/controllers/profile.controller.js');
const HTML_PATH = path.resolve(__dirname, '../../profile.html');

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
  const attributes = {};
  return Object.assign({
    children: [],
    className: '',
    innerHTML: '',
    textContent: '',
    style: {},
    classList: createClassList(),
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    }
  }, initial || {});
}

function resetRuntime() {
  jest.resetModules();
  global.window = global;
  global.document = {
    createElement() {
      return createElement();
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {}
  };
  delete window._KCPR;
  delete window.KCAPI;
  delete window.renderCommentMarkdownInline;
}

function installFallbacks() {
  window._KCPR = {
    presentation: {
      esc(value) {
        return String(value == null ? '' : value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      },
      fmtRelative(value) {
        return 'rel:' + String(value || '');
      },
      buildRatingStars(value) {
        return '<span class="stars">' + String(value || 0) + '</span>';
      },
      normalizeRatingSummary(raw, fallbackUserId) {
        return {
          userId: String((raw && (raw.userId || raw.user_id)) || fallbackUserId || '').trim() || null,
          average: raw && raw.average != null ? Number(raw.average) : null,
          count: Math.max(0, Number(raw && (raw.count != null ? raw.count : raw && raw.rating_count)) || 0)
        };
      },
      renderProfileRatingSummary() {}
    },
    collections: {
      renderInlineRichText(value) {
        return 'COLL:' + String(value || '');
      }
    }
  };
}

function loadRatingsModule() {
  require(MODULE_PATH);
  return window._KCPR.ratings;
}

function createDeps(overrides) {
  const config = overrides || {};
  const elements = config.elements || {};
  const state = Object.assign({
    profileId: 'user-1',
    ratings: [],
    ratingPage: 1,
    ratingHasMore: false,
    ratingSummary: { average: null, count: 0 }
  }, config.state || {});
  const deps = {
    $: (selector) => elements[selector] || null,
    state,
    ratingsPageSize: 10,
    esc: window._KCPR.presentation.esc,
    fmtRelative: window._KCPR.presentation.fmtRelative,
    buildRatingStars: jest.fn((value) => '<span class="stars">' + String(value || 0) + '</span>'),
    normalizeRatingSummary: jest.fn((raw, fallbackUserId) => ({
      userId: String((raw && (raw.userId || raw.user_id)) || fallbackUserId || '').trim() || null,
      average: raw && raw.average != null ? Number(raw.average) : null,
      count: Math.max(0, Number(raw && (raw.count != null ? raw.count : raw && raw.rating_count)) || 0)
    })),
    renderInlineRichText: jest.fn((value) => 'RICH:' + String(value || '')),
    renderProfileRatingSummary: jest.fn()
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
  installFallbacks();
  window.KCAPI = {};
});

afterEach(() => {
  resetRuntime();
});

describe('profile.ratings.js - contrato estatico', () => {
  test('mantem IIFE, use strict e namespace window._KCPR.ratings', () => {
    expect(moduleSource).toMatch(/\(function\s*\(\)\s*\{/);
    expect(moduleSource).toContain("'use strict';");
    expect(moduleSource).toContain('window._KCPR = window._KCPR || {};');
    expect(moduleSource).toContain('window._KCPR.ratings = Object.freeze({');
  });

  test('nao usa require/import em runtime', () => {
    expect(moduleSource).not.toMatch(/require\s*\(/);
    expect(moduleSource).not.toMatch(/import\s+/);
  });

  test('expoe 2 chaves publicas e o namespace fica frozen', () => {
    const ratings = loadRatingsModule();

    expect(Object.isFrozen(ratings)).toBe(true);
    expect(Object.keys(ratings).sort()).toEqual([
      'loadRatings',
      'renderRatings'
    ]);
  });
});

describe('profile.controller.js - contrato do split ratings', () => {
  test('mantem o namespace e o builder de dependencias do submodulo', () => {
    expect(controllerSource).toContain('window._KCPR.ratings = window._KCPR.ratings || {};');
    expect(controllerSource).toContain('function buildRatingsDeps() {');
    expect(controllerSource).toContain('buildRatingStars,');
    expect(controllerSource).toContain('normalizeRatingSummary,');
    expect(controllerSource).toContain('renderInlineRichText,');
    expect(controllerSource).toContain('renderProfileRatingSummary,');
    expect(controllerSource).toContain('ratingsPageSize: 10');
  });

  test('delega render/load para window._KCPR.ratings', () => {
    expect(controllerSource).toContain('ratings.renderRatings(items, append, buildRatingsDeps())');
    expect(controllerSource).toContain('ratings.loadRatings(reset, buildRatingsDeps())');
  });

  test('removeu o corpo inline antigo de ratings do controller', () => {
    expect(controllerSource).not.toContain('const avatarHtml = (isPublicReviewer && reviewer.avatarUrl)');
    expect(controllerSource).not.toContain('const payload = await window.KCAPI.listUserRatings(state.profileId, {');
    expect(controllerSource).not.toContain("'<div class=\"kc-profile-rating-card__top\">'");
  });
});

describe('profile.html - ordem canonica dos scripts do split ratings', () => {
  test('carrega presentation -> collections -> ratings -> controller no final da pagina', () => {
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

describe('window._KCPR.ratings - comportamento', () => {
  test('renderRatings mostra empty state quando nao ha itens', () => {
    const ratings = loadRatingsModule();
    const list = createElement();
    const empty = createElement({ style: {} });
    const loadMore = createElement({ style: {} });

    ratings.renderRatings([], false, createDeps({
      elements: {
        '#ratings-list': list,
        '#ratings-empty': empty,
        '#ratings-load-more': loadMore
      }
    }));

    expect(empty.style.display).toBe('block');
    expect(loadMore.style.display).toBe('none');
    expect(list.innerHTML).toBe('');
  });

  test('renderRatings cria card publico com avatar, comentario rico e estrelas', () => {
    const ratings = loadRatingsModule();
    const list = createElement();
    const deps = createDeps({
      elements: {
        '#ratings-list': list,
        '#ratings-empty': createElement({ style: {} }),
        '#ratings-load-more': createElement({ style: {} })
      },
      state: {
        ratingHasMore: true
      }
    });

    ratings.renderRatings([{
      rating: 5,
      comment: 'ExperiÃƒÂªncia ÃƒÂ³tima',
      createdAt: '2026-04-23T10:00:00.000Z',
      contextPostId: 'post-1',
      reviewer: {
        public: true,
        displayName: 'Ana',
        avatarUrl: 'https://cdn.example/avatar.png'
      }
    }], false, deps);

    expect(list.children).toHaveLength(1);
    expect(list.children[0].innerHTML).toContain('Avatar de Ana');
    expect(list.children[0].innerHTML).toContain('RICH:ExperiÃƒÂªncia ÃƒÂ³tima');
    expect(list.children[0].innerHTML).toContain('Intera');
    expect(list.children[0].innerHTML).toContain('/5');
    expect(deps.buildRatingStars).toHaveBeenCalledWith(5);
  });

  test('renderRatings usa fallback anonimo quando reviewer nao e publico', () => {
    const ratings = loadRatingsModule();
    const list = createElement();

    ratings.renderRatings([{
      rating: 3,
      comment: '',
      createdAt: '2026-04-23T10:00:00.000Z',
      reviewer: {
        public: false,
        displayName: 'Nao deve aparecer'
      }
    }], false, createDeps({
      elements: {
        '#ratings-list': list,
        '#ratings-empty': createElement({ style: {} }),
        '#ratings-load-more': createElement({ style: {} })
      }
    }));

    expect(list.children[0].innerHTML).toContain('Membro da comunidade');
    expect(list.children[0].innerHTML).toContain('n\u00E3o deixou coment\u00E1rio');
  });

  test('loadRatings consulta KCAPI, atualiza estado e resumo com total', async () => {
    const ratings = loadRatingsModule();
    const list = createElement();
    const loading = createElement({ style: {} });
    const empty = createElement({ style: {} });
    const loadMore = createElement({ style: {} });
    const deps = createDeps({
      ratingsPageSize: 4,
      elements: {
        '#ratings-list': list,
        '#ratings-loading': loading,
        '#ratings-empty': empty,
        '#ratings-load-more': loadMore
      },
      state: {
        profileId: 'user-9',
        ratingSummary: { average: 4.1, count: 2 }
      }
    });
    window.KCAPI.listUserRatings = jest.fn().mockResolvedValue({
      items: [{
        rating: 4,
        comment: 'Boa troca',
        createdAt: '2026-04-23T10:00:00.000Z',
        reviewer: { public: true, displayName: 'Bia' }
      }],
      hasMore: true,
      total: 6
    });

    await ratings.loadRatings(true, deps);

    expect(window.KCAPI.listUserRatings).toHaveBeenCalledWith('user-9', { page: 1, limit: 4 });
    expect(deps.state.ratings).toHaveLength(1);
    expect(deps.state.ratingHasMore).toBe(true);
    expect(deps.renderProfileRatingSummary).toHaveBeenCalled();
    expect(list.children).toHaveLength(1);
    expect(loadMore.style.display).toBe('block');
    expect(loading.style.display).toBe('none');
  });

  test('loadRatings concatena paginas quando reset=false', async () => {
    const ratings = loadRatingsModule();
    const list = createElement();
    const deps = createDeps({
      elements: {
        '#ratings-list': list,
        '#ratings-loading': createElement({ style: {} }),
        '#ratings-empty': createElement({ style: {} }),
        '#ratings-load-more': createElement({ style: {} })
      },
      state: {
        ratings: [{
          rating: 5,
          comment: 'Primeira',
          createdAt: '2026-04-22T10:00:00.000Z',
          reviewer: { public: true, displayName: 'Jo' }
        }],
        ratingPage: 2
      }
    });
    window.KCAPI.listUserRatings = jest.fn().mockResolvedValue({
      items: [{
        rating: 2,
        comment: 'Segunda',
        createdAt: '2026-04-23T10:00:00.000Z',
        reviewer: { public: true, displayName: 'Lu' }
      }],
      hasMore: false,
      total: 2
    });

    await ratings.loadRatings(false, deps);

    expect(deps.state.ratings).toHaveLength(2);
    expect(list.children).toHaveLength(1);
    expect(deps.state.ratingHasMore).toBe(false);
  });

  test('loadRatings mostra empty state em erro da API', async () => {
    const ratings = loadRatingsModule();
    const empty = createElement({ style: {} });
    const loading = createElement({ style: {} });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const deps = createDeps({
      elements: {
        '#ratings-list': createElement(),
        '#ratings-loading': loading,
        '#ratings-empty': empty,
        '#ratings-load-more': createElement({ style: {} })
      }
    });
    window.KCAPI.listUserRatings = jest.fn().mockRejectedValue(new Error('boom'));

    await ratings.loadRatings(true, deps);

    expect(empty.style.display).toBe('block');
    expect(loading.style.display).toBe('none');
    warnSpy.mockRestore();
  });
});
