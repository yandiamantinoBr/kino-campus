const fs = require('fs');
const path = require('path');

describe('KCNotifications dropdown hardening', () => {
  let apiNotifications;
  let unreadCount;

  beforeEach(() => {
    document.body.innerHTML = [
      '<button class="kc-notif-bell" id="kcNotifBell" style="display:none;">',
      '  <i class="fas fa-bell"></i>',
      '  <span class="kc-notif-badge" id="kcNotifBadge" style="display:none;"></span>',
      '</button>',
    ].join('');

    global.window = global.window || global;
    global.window.confirm = jest.fn(() => true);

    apiNotifications = [
      {
        id: 'notif-1',
        read: false,
        title: 'Nova mensagem',
        body: 'Seu post recebeu contato',
        type: 'comment_on_post',
        created_at: '2026-04-09T13:00:00Z',
        data: { post_id: 'post-1' },
      },
    ];
    unreadCount = 1;

    global.window.KCAPI = {
      getCurrentUser: jest.fn(() => Promise.resolve({ id: 'user-1' })),
      getNotifications: jest.fn(() => Promise.resolve({
        ok: true,
        unread: unreadCount,
        notifications: apiNotifications.slice(),
      })),
      getUnreadNotificationCount: jest.fn(() => Promise.resolve(unreadCount)),
      markNotificationsRead: jest.fn((ids) => {
        apiNotifications = apiNotifications.map((notif) => (
          ids.indexOf(notif.id) !== -1 ? Object.assign({}, notif, { read: true }) : notif
        ));
        unreadCount = apiNotifications.filter((notif) => !notif.read).length;
        return Promise.resolve({ ok: true });
      }),
      markAllNotificationsRead: jest.fn(() => {
        apiNotifications = apiNotifications.map((notif) => Object.assign({}, notif, { read: true }));
        unreadCount = 0;
        return Promise.resolve({ ok: true });
      }),
      clearNotifications: jest.fn(() => {
        const deleted = apiNotifications.length;
        apiNotifications = [];
        unreadCount = 0;
        return Promise.resolve({ ok: true, deleted: deleted });
      }),
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
    delete global.window.KCAPI;
    delete global.window.confirm;
    document.body.innerHTML = '';
  });

  test('keeps read, clear and realtime actions alive after rerender', async () => {
    const code = fs.readFileSync(
      path.resolve(__dirname, '..', 'assets', 'js', 'kc-notifications.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    (0, eval)(code);

    window.KCNotifications.init();

    await new Promise((resolve) => setTimeout(resolve, 900));
    await Promise.resolve();
    await Promise.resolve();
    expect(window.KCAPI.subscribeNotifications).toHaveBeenCalledTimes(1);

    window.KCNotifications.toggleDropdown();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('kcNotifDropdown')).not.toBeNull();
    expect(document.getElementById('kcNotifClearAll')).not.toBeNull();
    expect(window.KCAPI.getNotifications).toHaveBeenCalledTimes(1);

    apiNotifications = [
      {
        id: 'notif-2',
        read: false,
        title: 'Novo voto',
        body: 'Seu anuncio recebeu um voto',
        type: 'vote_on_post',
        created_at: '2026-04-09T13:05:00Z',
        data: { post_id: 'post-2' },
      },
      apiNotifications[0],
    ];
    unreadCount = 2;

    global.__kcNotifRealtimeCallback({
      eventType: 'INSERT',
      new: apiNotifications[0],
      old: null,
    });

    const firstItem = document.querySelector('.kc-notif-item[data-notif-id="notif-2"]');
    expect(firstItem).not.toBeNull();
    firstItem.addEventListener('click', (event) => event.preventDefault(), { once: true });
    firstItem.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    await Promise.resolve();

    expect(window.KCAPI.markNotificationsRead).toHaveBeenCalledWith(['notif-2']);

    window.KCNotifications.toggleDropdown();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    await Promise.resolve();

    apiNotifications = apiNotifications.map((notif) => (
      notif.id === 'notif-1' ? Object.assign({}, notif, { read: true }) : notif
    ));
    unreadCount = apiNotifications.filter((notif) => !notif.read).length;

    global.__kcNotifRealtimeCallback({
      eventType: 'UPDATE',
      new: apiNotifications.find((notif) => notif.id === 'notif-1'),
      old: {
        id: 'notif-1',
        read: false,
      },
    });

    expect(
      document.querySelector('.kc-notif-item[data-notif-id="notif-1"]').classList.contains('kc-notif-item--read')
    ).toBe(true);

    apiNotifications = apiNotifications.filter((notif) => notif.id !== 'notif-1');
    unreadCount = apiNotifications.filter((notif) => !notif.read).length;

    global.__kcNotifRealtimeCallback({
      eventType: 'DELETE',
      new: null,
      old: {
        id: 'notif-1',
      },
    });

    expect(document.querySelector('.kc-notif-item[data-notif-id="notif-1"]')).toBeNull();
    expect(document.getElementById('kcNotifClearAll')).not.toBeNull();

    document.getElementById('kcNotifClearAll').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    await Promise.resolve();

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(window.KCAPI.clearNotifications).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.kc-notif-dropdown__empty').textContent).toContain('Nenhuma');
  });
});
