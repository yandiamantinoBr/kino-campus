const fs = require('fs');
const path = require('path');

describe('kc-comments session hydration', () => {
  beforeAll(() => {
    global.window = global.window || global;
    global.KCUtils = {
      escapeHtml: (value) => String(value == null ? '' : value),
    };
    global.KC_ENV = { isProduction: false };
    global.showToast = jest.fn();
    global.updateCommentPreview = jest.fn();

    const filePath = path.resolve(__dirname, '..', '..', 'assets', 'js', 'kc-comments.js');
    const code = fs.readFileSync(filePath, 'utf-8');
    // eslint-disable-next-line no-eval
    (0, eval)(code);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '<div id="commentsContainer"></div>';

    let resolveRefresh;
    global.KCAPI = {
      ENV: { driver: 'supabase' },
      getCachedComments: jest.fn(() => ({
        data: [
          { id: 'c1', author_name: 'Lia', body: 'Comentario cacheado', likes: 2, liked_by_me: false, created_at: '2026-04-09T10:00:00Z' },
        ],
        signature: 'sig-cache',
        isFresh: true,
      })),
      refreshComments: jest.fn(() => new Promise((resolve) => {
        resolveRefresh = resolve;
      })),
      getCurrentUser: jest.fn(() => Promise.resolve({ id: 'user-1' })),
      getMyProfile: jest.fn(() => Promise.resolve(null)),
      _resolveRefresh: () => resolveRefresh,
    };
  });

  test('renderComments paints the cached list before the background refresh finishes', async () => {
    renderComments('post-1', 'commentsContainer');

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.getElementById('commentsContainer').textContent).toContain('Comentario cacheado');
    expect(KCAPI.refreshComments).toHaveBeenCalledWith('post-1', { force: true });

    KCAPI._resolveRefresh()([
      { id: 'c1', author_name: 'Lia', body: 'Comentario cacheado', likes: 3, liked_by_me: true, created_at: '2026-04-09T10:00:00Z' },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.getElementById('commentsContainer').textContent).toContain('3');
  });
});
