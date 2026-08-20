'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CATALOG = fs.readFileSync(
  path.join(ROOT, 'assets', 'js', 'controllers', 'public', 'oportunidades.catalog.js'),
  'utf8'
);
const CONTROLLER = fs.readFileSync(
  path.join(ROOT, 'assets', 'js', 'controllers', 'public', 'oportunidades.controller.js'),
  'utf8'
);

function makePosts(page, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `catalog-${page}-${index}`,
    modulo: 'oportunidades',
    titulo: `Oportunidade ${page}-${index}`,
  }));
}

function installCatalogEnvironment() {
  window._KCOpCatalog = undefined;
  window.KCSessionStore = {
    get: jest.fn(() => null),
    set: jest.fn(),
  };
  window.kcUserPosts = { list: jest.fn(() => []) };
  // eslint-disable-next-line no-eval
  (0, eval)(CATALOG);
}

describe('catálogo progressivo de Oportunidades', () => {
  beforeEach(() => {
    installCatalogEnvironment();
  });

  test('usa somente uma página no caminho crítico e expande apenas depois', async () => {
    window.KCAPI = {
      getPosts: jest.fn(({ page }) => Promise.resolve(makePosts(page, 50))),
    };
    const catalog = window._KCOpCatalog.createCatalog();

    await catalog.fetch({ targetPages: 1 });
    expect(window.KCAPI.getPosts).toHaveBeenCalledTimes(1);
    expect(window.KCAPI.getPosts).toHaveBeenLastCalledWith({
      module: 'oportunidades', page: 1, limit: 50, light: true,
    });

    await catalog.fetch({ targetPages: 4 });
    expect(window.KCAPI.getPosts).toHaveBeenCalledTimes(4);
    expect(window.KCAPI.getPosts.mock.calls.map(([params]) => params.page)).toEqual([1, 2, 3, 4]);
  });

  test('um catálogo completo de sessão não dispara nova leitura', async () => {
    window.KCSessionStore.get.mockReturnValue({
      value: {
        posts: makePosts(1, 50),
        catalogPageCount: 4,
        catalogExhausted: true,
      },
    });
    window.KCAPI = { getPosts: jest.fn() };
    const catalog = window._KCOpCatalog.createCatalog();

    expect(catalog.restore()).toHaveLength(50);
    await catalog.fetch({ targetPages: 4 });
    expect(window.KCAPI.getPosts).not.toHaveBeenCalled();
  });

  test('o controller restaura cache antes de agendar expansão fora do caminho crítico', () => {
    expect(CONTROLLER).toContain('const restoredCatalog = restoreCachedPosts();');
    expect(CONTROLLER).toContain('fetchAllPosts({ targetPages: 1 }).finally(scheduleCatalogExpansion);');
    expect(CONTROLLER).toContain('scheduleCatalogExpansion();');
    expect(CONTROLLER).not.toContain('for (let page = 1; page <= maxPages; page += 1)');
  });
});
