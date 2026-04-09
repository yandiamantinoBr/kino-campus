const fs = require('fs');
const path = require('path');

describe('KCNotifications dropdown hardening', () => {
  beforeEach(() => {
    document.body.innerHTML = [
      '<button id="kcNotifBell" style="display:none;">',
      '  <span id="kcNotifBadge" style="display:none;"></span>',
      '</button>',
    ].join('');

    global.window = global.window || global;
    global.window.KCAPI = {
      getCurrentUser: jest.fn(() => Promise.resolve({ id: 'user-1' })),
      getNotifications: jest.fn(() => Promise.resolve({
        ok: true,
        unread: 1,
        notifications: [
          {
            id: 'notif-1',
            read: false,
            title: 'Nova mensagem',
            body: 'Seu post recebeu contato',
            type: 'comment_on_post',
            created_at: '2026-04-09T13:00:00Z',
            data: { post_id: 'post-1' },
          },
        ],
      })),
      getUnreadNotificationCount: jest.fn(() => Promise.resolve(1)),
      markNotificationsRead: jest.fn(() => Promise.resolve({ ok: true })),
      markAllNotificationsRead: jest.fn(() => Promise.resolve({ ok: true })),
      subscribeNotifications: jest.fn((userId, callback) => {
        global.__kcNotifRealtimeCallback = callback;
        return { userId };
      }),
      unsubscribeNotifications: jest.fn(),
    };
  });

  afterEach(() => {
    delete global.__kcNotifRealtimeCallback;
    delete global.window.KCNotifications;
    document.body.innerHTML = '';
  });

  test('delegates dropdown actions after rerender and keeps item/read interactions alive', async () => {
    const code = fs.readFileSync(
      path.resolve(__dirname, '..', 'assets', 'js', 'kc-notifications.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    (0, eval)(code);

    window.KCNotifications.init();

    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(window.KCAPI.subscribeNotifications).toHaveBeenCalledTimes(1);

    window.KCNotifications.toggleDropdown();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.getElementById('kcNotifDropdown')).not.toBeNull();
    expect(window.KCAPI.getNotifications).toHaveBeenCalledTimes(1);

    global.__kcNotifRealtimeCallback({
      id: 'notif-2',
      read: false,
      title: 'Novo voto',
      body: 'Seu anúncio recebeu um voto',
      type: 'vote_on_post',
      created_at: '2026-04-09T13:05:00Z',
      data: { post_id: 'post-2' },
    });

    const markAllBtn = document.getElementById('kcNotifMarkAll');
    expect(markAllBtn).not.toBeNull();
    const firstItem = document.querySelector('.kc-notif-item[data-notif-id="notif-2"]');
    expect(firstItem).not.toBeNull();
    firstItem.addEventListener('click', (event) => event.preventDefault(), { once: true });
    firstItem.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(window.KCAPI.markNotificationsRead).toHaveBeenCalledWith(['notif-2']);

    window.KCNotifications.toggleDropdown();
    await new Promise((resolve) => setTimeout(resolve, 0));

    global.__kcNotifRealtimeCallback({
      id: 'notif-3',
      read: false,
      title: 'Nova resposta',
      body: 'Responderam o seu comentário',
      type: 'comment_reply',
      created_at: '2026-04-09T13:06:00Z',
      data: { post_id: 'post-3' },
    });

    document.getElementById('kcNotifMarkAll').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(window.KCAPI.markAllNotificationsRead).toHaveBeenCalledTimes(1);
  });
});
