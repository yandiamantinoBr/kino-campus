'use strict';

const fs = require('fs');
const path = require('path');

const MODULE_PATH = path.resolve(__dirname, '../assets/js/controllers/profile.collections.js');
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
  const attributes = {};
  const listeners = {};
  return Object.assign({
    children: [],
    className: '',
    href: '',
    id: '',
    innerHTML: '',
    textContent: '',
    value: '',
    style: {},
    dataset: {},
    disabled: false,
    classList: createClassList(),
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    getListener(type) {
      return listeners[type] || null;
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

function installPresentationFallback() {
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
      buildPostDetailHref(value) {
        const normalized = String(value || '').trim();
        return normalized ? ('_product.html?id=' + encodeURIComponent(normalized)) : '';
      },
      statusBadge(value) {
        return '<span class="status">' + String(value || '') + '</span>';
      },
      visibilityBadge(value) {
        return '<span class="visibility">' + String(value || '') + '</span>';
      },
      normalizeSaveKinds(value) {
        const list = Array.isArray(value) ? value : (value ? [value] : []);
        return Array.from(new Set(list.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)));
      },
      buildSaveBadges(value) {
        return this.normalizeSaveKinds(value).map((kind) => '<span class="save-kind">' + kind + '</span>').join('');
      },
      buildRatingStars(value) {
        return '<span class="stars">' + String(value || 0) + '</span>';
      },
      linkifyBio(value) {
        return 'LINK:' + String(value || '');
      },
      setBadgeCount() {}
    }
  };
}

function loadCollectionsModule() {
  require(MODULE_PATH);
  return window._KCPR.collections;
}

function createDeps(overrides) {
  const config = overrides || {};
  const elements = config.elements || {};
  const groups = config.groups || {};
  const state = Object.assign({
    isPublicView: false,
    profileId: 'user-1',
    user: { id: 'user-1' },
    posts: [],
    postPage: 1,
    postStatus: '',
    postHasMore: false,
    comments: [],
    commentPage: 1,
    commentHasMore: false,
    savedItems: [],
    savedPage: 1,
    savedKind: '',
    savedHasMore: false,
    ratings: [],
    ratingPage: 1,
    ratingHasMore: false,
    activeTab: 'activities'
  }, config.state || {});
  const deps = {
    $: (selector) => elements[selector] || null,
    $$: (selector) => groups[selector] || [],
    state,
    pageSize: 12,
    commentPageSize: 15,
    getClient: jest.fn(() => null),
    esc: window._KCPR.presentation.esc,
    fmtRelative: window._KCPR.presentation.fmtRelative,
    buildPostDetailHref: window._KCPR.presentation.buildPostDetailHref,
    statusBadge: window._KCPR.presentation.statusBadge,
    visibilityBadge: window._KCPR.presentation.visibilityBadge,
    normalizeSaveKinds: window._KCPR.presentation.normalizeSaveKinds,
    buildSaveBadges: window._KCPR.presentation.buildSaveBadges.bind(window._KCPR.presentation),
    buildRatingStars: window._KCPR.presentation.buildRatingStars,
    linkifyBio: window._KCPR.presentation.linkifyBio,
    setBadgeCount: jest.fn((selector, count) => {
      const badge = elements[selector];
      if (badge) badge.textContent = String(count);
    }),
    loadRatings: jest.fn(() => Promise.resolve())
  };
  return Object.assign(deps, config, { $, $$, state });

  function $(selector) {
    return elements[selector] || null;
  }

  function $$(selector) {
    return groups[selector] || [];
  }
}

function createClientMock(commentRows, postRows) {
  return {
    from(table) {
      if (table === 'comments') {
        const query = {
          select() { return query; },
          eq() { return query; },
          order() { return query; },
          range() { return Promise.resolve({ data: commentRows, error: null }); },
          limit() { return Promise.resolve({ data: commentRows, error: null }); }
        };
        return query;
      }

      if (table === 'posts') {
        const query = {
          select() { return query; },
          in(field, batch) {
            const values = Array.isArray(batch) ? batch : [];
            return Promise.resolve({
              data: (postRows || []).filter((post) => values.includes(post[field])),
              error: null
            });
          }
        };
        return query;
      }

      throw new Error('Tabela inesperada: ' + table);
    }
  };
}

beforeAll(() => {
  moduleSource = fs.readFileSync(MODULE_PATH, 'utf8');
  controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  htmlSource = fs.readFileSync(HTML_PATH, 'utf8');
});

beforeEach(() => {
  resetRuntime();
  installPresentationFallback();
  window.KCAPI = {};
});

afterEach(() => {
  resetRuntime();
});

describe('profile.collections.js - contrato estatico', () => {
  test('mantem IIFE, use strict e namespace window._KCPR.collections', () => {
    expect(moduleSource).toMatch(/\(function\s*\(\)\s*\{/);
    expect(moduleSource).toContain("'use strict';");
    expect(moduleSource).toContain('window._KCPR = window._KCPR || {};');
    expect(moduleSource).toContain('window._KCPR.collections = Object.freeze({');
  });

  test('nao usa require/import em runtime', () => {
    expect(moduleSource).not.toMatch(/require\s*\(/);
    expect(moduleSource).not.toMatch(/import\s+/);
  });

  test('expoe 11 chaves publicas e o namespace fica frozen', () => {
    const collections = loadCollectionsModule();

    expect(Object.isFrozen(collections)).toBe(true);
    expect(Object.keys(collections).sort()).toEqual([
      'bindTabsAndLists',
      'loadActivities',
      'loadComments',
      'loadPosts',
      'loadSaved',
      'loadSavedBadgeCount',
      'renderComments',
      'renderInlineRichText',
      'renderPosts',
      'renderSaved',
      'switchTab'
    ]);
  });
});

describe('profile.controller.js - contrato do split collections', () => {
  test('mantem o namespace e o builder de dependencias do submodulo', () => {
    expect(controllerSource).toContain('window._KCPR.collections = window._KCPR.collections || {};');
    expect(controllerSource).toContain('function buildCollectionsDeps() {');
    expect(controllerSource).toContain('commentPageSize: COMMENT_PAGE_SIZE');
    expect(controllerSource).toContain('buildPostDetailHref,');
    expect(controllerSource).toContain('loadRatings,');
    expect(controllerSource).toContain('state,');
  });

  test('delega loaders e tabs para window._KCPR.collections', () => {
    expect(controllerSource).toContain('collections.loadSavedBadgeCount(authorId, buildCollectionsDeps())');
    expect(controllerSource).toContain('collections.renderInlineRichText(text, buildCollectionsDeps())');
    expect(controllerSource).toContain('collections.loadPosts(reset, buildCollectionsDeps())');
    expect(controllerSource).toContain('collections.loadComments(reset, buildCollectionsDeps())');
    expect(controllerSource).toContain('collections.loadSaved(reset, buildCollectionsDeps())');
    expect(controllerSource).toContain('collections.loadActivities(buildCollectionsDeps())');
    expect(controllerSource).toContain('collections.switchTab(tabId, buildCollectionsDeps())');
    expect(controllerSource).toContain('collections.bindTabsAndLists(buildCollectionsDeps())');
  });

  test('removeu o corpo inline antigo de collections/activities do controller', () => {
    expect(controllerSource).not.toContain('var recentPosts = state.isPublicView');
    expect(controllerSource).not.toContain('var commentPayload = await loadProfileComments(client, authorId, { limit: 8 });');
    expect(controllerSource).not.toContain("'<div class=\"kc-profile-activity-item\">'");
  });
});

describe('profile.html - ordem canonica dos scripts do split collections', () => {
  test('carrega presentation -> collections -> controller no final da pagina', () => {
    const orderedScripts = [
      '<script defer src="assets/js/kc-ranking.js"></script>',
      '<script defer src="assets/js/controllers/profile.presentation.js"></script>',
      '<script defer src="assets/js/controllers/profile.collections.js"></script>',
      '<script defer src="assets/js/controllers/profile.ratings.js"></script>',
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

describe('window._KCPR.collections - comportamento', () => {
  test('renderInlineRichText usa o markdown helper global quando disponivel', () => {
    const collections = loadCollectionsModule();
    window.renderCommentMarkdownInline = jest.fn(() => '<strong>markdown</strong>');

    expect(collections.renderInlineRichText('Texto', createDeps())).toBe('<strong>markdown</strong>');
    expect(window.renderCommentMarkdownInline).toHaveBeenCalledWith('Texto');
  });

  test('renderInlineRichText usa linkifyBio como fallback', () => {
    const collections = loadCollectionsModule();

    expect(collections.renderInlineRichText('Link cru', createDeps())).toBe('LINK:Link cru');
  });

  test('renderPosts cria cards com href canonico, badges e marcador de exemplo', () => {
    const collections = loadCollectionsModule();
    const list = createElement();
    const empty = createElement({ style: {} });
    const loadMore = createElement({ style: {} });
    const deps = createDeps({
      elements: {
        '#posts-list': list,
        '#posts-empty': empty,
        '#posts-load-more': loadMore
      },
      state: {
        isPublicView: false,
        postHasMore: true
      }
    });

    collections.renderPosts([{
      uuid: 'post-1',
      title: 'Oferta de quarto',
      status: 'pending',
      visibility: 'private',
      module: 'moradia',
      category: 'quarto',
      created_at: '2026-04-23T10:00:00.000Z',
      legacy_id: 'legacy-1'
    }], false, deps);

    expect(list.children).toHaveLength(1);
    expect(list.children[0].href).toContain('_product.html?id=post-1');
    expect(list.children[0].innerHTML).toContain('Oferta de quarto');
    expect(list.children[0].innerHTML).toContain('status');
    expect(list.children[0].innerHTML).toContain('visibility');
    expect(list.children[0].innerHTML).toContain('moradia');
    expect(list.children[0].innerHTML).toContain('Exemplo');
    expect(loadMore.style.display).toBe('block');
  });

  test('loadPosts usa KCAPI.getMyPosts no owner view e pagina pelo pageSize', async () => {
    const collections = loadCollectionsModule();
    const list = createElement();
    const loading = createElement({ style: {} });
    const empty = createElement({ style: {} });
    const loadMore = createElement({ style: {} });
    const deps = createDeps({
      pageSize: 2,
      elements: {
        '#posts-list': list,
        '#posts-loading': loading,
        '#posts-empty': empty,
        '#posts-load-more': loadMore
      },
      state: {
        isPublicView: false,
        postPage: 1,
        postStatus: 'pending'
      }
    });

    window.KCAPI.getMyPosts = jest.fn().mockResolvedValue([
      { uuid: 'p-1', title: 'Post 1', status: 'pending', visibility: 'private' },
      { uuid: 'p-2', title: 'Post 2', status: 'pending', visibility: 'private' }
    ]);

    await collections.loadPosts(true, deps);

    expect(window.KCAPI.getMyPosts).toHaveBeenCalledWith({ page: 1, limit: 2, status: 'pending' });
    expect(deps.state.posts).toHaveLength(2);
    expect(deps.state.postHasMore).toBe(true);
    expect(list.children).toHaveLength(2);
    expect(loading.style.display).toBe('none');
  });

  test('loadPosts usa KCAPI.getPostsByAuthorId no public view', async () => {
    const collections = loadCollectionsModule();
    const deps = createDeps({
      pageSize: 3,
      elements: {
        '#posts-list': createElement(),
        '#posts-loading': createElement({ style: {} }),
        '#posts-empty': createElement({ style: {} }),
        '#posts-load-more': createElement({ style: {} })
      },
      state: {
        isPublicView: true,
        profileId: 'author-2'
      }
    });

    window.KCAPI.getPostsByAuthorId = jest.fn().mockResolvedValue([
      { uuid: 'p-1', title: 'Post publico' }
    ]);

    await collections.loadPosts(true, deps);

    expect(window.KCAPI.getPostsByAuthorId).toHaveBeenCalledWith('author-2', { page: 1, limit: 3 });
    expect(deps.state.posts).toHaveLength(1);
    expect(deps.state.postHasMore).toBe(false);
  });

  test('loadComments consulta Supabase, enriquece posts e renderiza link canonico', async () => {
    const collections = loadCollectionsModule();
    const list = createElement();
    const deps = createDeps({
      commentPageSize: 10,
      elements: {
        '#comments-list': list,
        '#comments-loading': createElement({ style: {} }),
        '#comments-empty': createElement({ style: {} }),
        '#comments-load-more': createElement({ style: {} })
      },
      getClient: jest.fn(() => createClientMock([
        { id: 'c-1', created_at: '2026-04-22T09:00:00.000Z', body: 'Comentário legal', post_id: 'post-1' }
      ], [
        { id: 'post-1', legacy_id: 'legacy-1', title: 'Post alvo' }
      ]))
    });

    await collections.loadComments(true, deps);

    expect(deps.state.comments).toHaveLength(1);
    expect(list.children).toHaveLength(1);
    expect(list.children[0].innerHTML).toContain('Post alvo');
    expect(list.children[0].innerHTML).toContain('_product.html?id=legacy-1');
    expect(list.children[0].innerHTML).toContain('LINK:Comentário legal');
  });

  test('renderSaved cria card com badges de save kinds e href canonico', () => {
    const collections = loadCollectionsModule();
    const list = createElement();
    const deps = createDeps({
      elements: {
        '#saved-list': list,
        '#saved-empty': createElement({ style: {} }),
        '#saved-load-more': createElement({ style: {} })
      },
      state: {
        isPublicView: false,
        savedHasMore: false
      }
    });

    collections.renderSaved([{
      uuid: 'saved-1',
      title: 'Anúncio salvo',
      save_kinds: ['favorite', 'highlight'],
      status: 'published',
      visibility: 'public',
      module: 'compra-venda',
      category: 'livros',
      saved_at: '2026-04-22T09:00:00.000Z'
    }], false, deps);

    expect(list.children).toHaveLength(1);
    expect(list.children[0].href).toContain('_product.html?id=saved-1');
    expect(list.children[0].innerHTML).toContain('save-kind');
    expect(list.children[0].innerHTML).toContain('compra-venda');
  });

  test('loadSavedBadgeCount usa getMySavedPostsCount no owner view', async () => {
    const collections = loadCollectionsModule();
    const badge = createElement();
    const deps = createDeps({
      elements: { '#badge-saved': badge },
      state: { isPublicView: false }
    });
    window.KCAPI.getMySavedPostsCount = jest.fn().mockResolvedValue(7);

    await collections.loadSavedBadgeCount('user-1', deps);

    expect(window.KCAPI.getMySavedPostsCount).toHaveBeenCalledWith({});
    expect(deps.setBadgeCount).toHaveBeenCalledWith('#badge-saved', 7);
    expect(badge.textContent).toBe('7');
  });

  test('loadSavedBadgeCount usa getProfileHighlightsCount no public view', async () => {
    const collections = loadCollectionsModule();
    const deps = createDeps({
      state: { isPublicView: true }
    });
    window.KCAPI.getProfileHighlightsCount = jest.fn().mockResolvedValue(4);

    await collections.loadSavedBadgeCount('public-user', deps);

    expect(window.KCAPI.getProfileHighlightsCount).toHaveBeenCalledWith('public-user');
    expect(deps.setBadgeCount).toHaveBeenCalledWith('#badge-saved', 4);
  });

  test('loadActivities agrega posts e comentarios em um unico feed html', async () => {
    const collections = loadCollectionsModule();
    const list = createElement();
    const loading = createElement({ style: {} });
    const empty = createElement({ style: {} });
    const deps = createDeps({
      elements: {
        '#activities-list': list,
        '#activities-loading': loading,
        '#activities-empty': empty
      },
      getClient: jest.fn(() => createClientMock([
        { id: 'c-1', created_at: '2026-04-22T09:00:00.000Z', body: 'Comentou bastante', post_id: 'post-2' }
      ], [
        { id: 'post-2', legacy_id: 'legacy-2', title: 'Post comentado' }
      ]))
    });

    window.KCAPI.getMyPosts = jest.fn().mockResolvedValue([
      { uuid: 'post-1', created_at: '2026-04-23T09:00:00.000Z', title: 'Meu post', status: 'published' }
    ]);

    await collections.loadActivities(deps);

    expect(list.innerHTML).toContain('Publicou');
    expect(list.innerHTML).toContain('Comentou em');
    expect(list.innerHTML).toContain('_product.html?id=post-1');
    expect(list.innerHTML).toContain('_product.html?id=legacy-2');
    expect(loading.style.display).toBe('none');
    expect(empty.style.display || '').not.toBe('block');
  });

  test('switchTab alterna classes e aciona loadRatings lazy quando necessario', () => {
    const collections = loadCollectionsModule();
    const ratingsButton = createElement({
      getAttribute(name) {
        return name === 'data-kc-tab' ? 'ratings' : null;
      }
    });
    const postsButton = createElement({
      getAttribute(name) {
        return name === 'data-kc-tab' ? 'posts' : null;
      }
    });
    const ratingsPanel = createElement({ id: 'tab-ratings' });
    const postsPanel = createElement({ id: 'tab-posts' });
    const deps = createDeps({
      groups: {
        '.kc-profile-tab': [postsButton, ratingsButton],
        '.kc-profile-tab-panel': [postsPanel, ratingsPanel]
      },
      state: {
        ratings: [],
        activeTab: 'posts'
      }
    });

    collections.switchTab('ratings', deps);

    expect(deps.state.activeTab).toBe('ratings');
    expect(ratingsButton.classList.contains('active')).toBe(true);
    expect(postsButton.classList.contains('active')).toBe(false);
    expect(ratingsPanel.classList.contains('active')).toBe(true);
    expect(postsPanel.classList.contains('active')).toBe(false);
    expect(deps.loadRatings).toHaveBeenCalledWith(true);
  });

  test('bindTabsAndLists conecta filtros, tabs e paginacao incremental', async () => {
    const collections = loadCollectionsModule();
    const ratingsTab = createElement({
      getAttribute(name) {
        return name === 'data-kc-tab' ? 'ratings' : null;
      }
    });
    const ratingsMore = createElement();
    const postsStatus = createElement({ value: '' });
    const savedKind = createElement({ value: '' });
    const deps = createDeps({
      groups: {
        '[data-kc-tab]': [ratingsTab],
        '.kc-profile-tab': [ratingsTab],
        '.kc-profile-tab-panel': [createElement({ id: 'tab-ratings' })]
      },
      elements: {
        '#profile-posts-status': postsStatus,
        '#profile-saved-kind': savedKind,
        '#posts-load-more': createElement(),
        '#comments-load-more': createElement(),
        '#saved-load-more': createElement(),
        '#ratings-load-more': ratingsMore,
        '#ratings-list': createElement(),
        '#ratings-empty': createElement({ style: {} }),
        '#ratings-loading': createElement({ style: {} })
      }
    });
    window.KCAPI.getMyPosts = jest.fn().mockResolvedValue([]);
    window.KCAPI.getMySavedPosts = jest.fn().mockResolvedValue([]);

    collections.bindTabsAndLists(deps);

    ratingsTab.getListener('click')();
    postsStatus.getListener('change')({ target: { value: 'hidden' } });
    savedKind.getListener('change')({ target: { value: 'favorite' } });
    ratingsMore.getListener('click')();

    expect(deps.state.activeTab).toBe('ratings');
    expect(deps.loadRatings).toHaveBeenNthCalledWith(1, true);
    expect(deps.state.postStatus).toBe('hidden');
    expect(deps.state.savedKind).toBe('favorite');
    expect(deps.state.ratingPage).toBe(2);
    expect(deps.loadRatings).toHaveBeenNthCalledWith(2, false);
    expect(window.KCAPI.getMyPosts).toHaveBeenCalledWith({ page: 1, limit: 12, status: 'hidden' });
    expect(window.KCAPI.getMySavedPosts).toHaveBeenCalledWith({ page: 1, limit: 12, kind: 'favorite' });
  });
});
