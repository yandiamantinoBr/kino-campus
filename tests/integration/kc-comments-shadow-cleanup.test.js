const fs = require('fs');
const path = require('path');

describe('kc-comments shadow cleanup', () => {
  const sourcePath = path.resolve(__dirname, '..', '..', 'assets', 'js', 'features', 'kc-comments.js');

  beforeAll(() => {
    global.window = global.window || global;
    global.KCUtils = {
      escapeHtml: (value) => String(value == null ? '' : value),
      renderMarkdownInline: (value) => String(value == null ? '' : value),
    };
    global.KC_ENV = { isProduction: false };
    global.showToast = jest.fn();
    global.updateCommentPreview = jest.fn();
    global.KCHomeCategories = { trackEvent: jest.fn() };
    global.KCProfiles = { getCurrentProfile: jest.fn(() => null) };
    global.KCSupabase = { getUser: jest.fn(() => null) };

    const code = fs.readFileSync(sourcePath, 'utf-8');
    // eslint-disable-next-line no-eval
    (0, eval)(code);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '<div id="commentsContainer"></div>';
    window.localStorage.clear();
    window.KCAPI = {
      ENV: { driver: 'local' },
      getCurrentUser: jest.fn(() => Promise.resolve(null)),
      getMyProfile: jest.fn(() => Promise.resolve(null)),
    };
    renderComments = jest.fn();
    updateCommentPreview = jest.fn();
    showToast = jest.fn();
  });

  test('keeps a single declaration for shadow-prone comment helpers', () => {
    const source = fs.readFileSync(sourcePath, 'utf-8');
    ['addComment', 'normalizeCommentForRender', '_renderCommentList', 'deleteComment', 'submitComment'].forEach((name) => {
      const matches = source.match(new RegExp(`(?:async\\s+)?function ${name}\\s*\\(`, 'g')) || [];
      expect(matches).toHaveLength(1);
    });
  });

  test('comment action buttons declare type button', () => {
    const source = fs.readFileSync(sourcePath, 'utf-8');
    [
      'class="kc-like-comment-btn',
      'data-kc-comment-action="reply"',
      'data-kc-comment-action="edit"',
      'data-kc-comment-action="delete"',
      'data-kc-comment-action="report"',
    ].forEach((marker) => {
      const index = source.indexOf(marker);
      expect(index).toBeGreaterThan(-1);
      const buttonStart = source.lastIndexOf('<button', index);
      const buttonOpen = source.slice(buttonStart, source.indexOf('>', index) + 1);
      expect(buttonOpen).toContain('type="button"');
    });
  });

  test('comment action icons are decorative', () => {
    const source = fs.readFileSync(sourcePath, 'utf-8');
    ['fa-thumbs-up', 'fa-reply', 'fa-pen', 'fa-trash', 'fa-flag'].forEach((iconClass) => {
      const index = source.indexOf(iconClass);
      expect(index).toBeGreaterThan(-1);
      const iconOpen = source.slice(source.lastIndexOf('<i', index), source.indexOf('>', index) + 1);
      expect(iconOpen).toContain('aria-hidden="true"');
    });
  });

  test('submitComment persists replies with parentId in local mode', async () => {
    document.body.innerHTML = `
      <div id="commentsContainer"></div>
      <input data-post-id="post-1" name="author" value="Ana">
    `;

    window.localStorage.setItem('kc_comments_post-1', JSON.stringify([
      { id: 1, author: 'Lia', text: 'Raiz', created_at: '2026-04-09T10:00:00Z', likes: 0 },
    ]));

    const replyTextarea = document.createElement('textarea');
    replyTextarea.value = 'Resposta local';
    const submitButton = document.createElement('button');
    setActiveReplyState('post-1', '1', 'commentsContainer');

    await submitComment('post-1', 'commentsContainer', {
      parentId: '1',
      textarea: replyTextarea,
      submitButton: submitButton,
    });

    const stored = JSON.parse(window.localStorage.getItem('kc_comments_post-1'));
    expect(stored).toHaveLength(2);
    expect(stored[1].text).toBe('Resposta local');
    expect(stored[1].parent_id).toBe('1');
    expect(isActiveReplyTarget('post-1', '1', 'commentsContainer')).toBe(false);
    expect(replyTextarea.value).toBe('');
    expect(submitButton.disabled).toBe(false);
    expect(renderComments).toHaveBeenCalledWith('post-1', 'commentsContainer');
    expect(showToast).toHaveBeenCalledWith('Resposta enviada!', 'info', 1800);
  });

  test('deleteComment removes root comments and direct replies in local mode', async () => {
    window.localStorage.setItem('kc_comments_post-1', JSON.stringify([
      { id: 1, author: 'Lia', text: 'Raiz', created_at: '2026-04-09T10:00:00Z', likes: 0 },
      { id: 2, author: 'Noah', text: 'Resposta 1', parent_id: '1', created_at: '2026-04-09T10:01:00Z', likes: 0 },
      { id: 3, author: 'Eva', text: 'Resposta 2', parent_id: '1', created_at: '2026-04-09T10:02:00Z', likes: 0 },
      { id: 4, author: 'Mia', text: 'Outro tópico', created_at: '2026-04-09T10:03:00Z', likes: 0 },
    ]));

    setActiveReplyState('post-1', '1', 'commentsContainer');
    await deleteComment('post-1', '1', 'commentsContainer');

    const stored = JSON.parse(window.localStorage.getItem('kc_comments_post-1'));
    expect(stored).toEqual([
      { id: 4, author: 'Mia', text: 'Outro tópico', created_at: '2026-04-09T10:03:00Z', likes: 0 },
    ]);
    expect(isActiveReplyTarget('post-1', '1', 'commentsContainer')).toBe(false);
    expect(renderComments).toHaveBeenCalledWith('post-1', 'commentsContainer');
    expect(showToast).toHaveBeenCalledWith('Comentário excluído.', 'info', 1800);
  });
});
