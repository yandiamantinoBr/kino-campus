const fs = require('fs');
const path = require('path');

describe('KCNotifications dropdown hardening', () => {
  let apiNotifications;
  let unreadCount;
  let documentListenerSpy;

  beforeAll(() => {
    global.window = global.window || global;
    require('../../assets/js/core/kc-i18n.js');
  });

  beforeEach(() => {
    documentListenerSpy = jest.spyOn(document, 'addEventListener');
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
      chat: {
        unreadTotal: jest.fn(() => Promise.resolve(3)),
      },
      subscribeNotifications: jest.fn((userId, callback) => {
        global.__kcNotifRealtimeCallback = callback;
        return { userId };
      }),
      unsubscribeNotifications: jest.fn(),
    };
  });

  afterEach(() => {
    if (window.KCNotifications) window.KCNotifications.destroy();
    documentListenerSpy.mock.calls.forEach(([type, listener, options]) => {
      document.removeEventListener(type, listener, options);
    });
    documentListenerSpy.mockRestore();
    delete global.__kcNotifRealtimeCallback;
    delete global.window.KCNotifications;
    delete global.window.KCAPI;
    delete global.window.confirm;
    document.body.innerHTML = '';
  });

  test('opens dropdown immediately while getNotifications revalidates in background', () => {
    const code = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'assets', 'js', 'core', 'kc-notifications.js'),
      'utf8'
    );
    window.KCAPI.getNotifications = jest.fn(() => new Promise(() => {}));
    // eslint-disable-next-line no-eval
    (0, eval)(code);

    window.KCNotifications.init();
    window.KCNotifications.toggleDropdown();

    expect(document.getElementById('kcNotifDropdown')).not.toBeNull();
    expect(window.KCAPI.getNotifications).toHaveBeenCalledTimes(1);
  });

  test('mantém Mensagens no menu móvel sem FAB sobre o conteúdo', () => {
    document.body.innerHTML = [
      '<div class="kc-user-actions"><button class="kc-notif-bell" id="kcNotifBell"></button></div>',
      '<div class="kc-mobile-menu-content"><a href="eventos.html">Eventos</a></div>',
      '<a class="kc-chat-mobile-fab" href="mensagens.html">legado</a>',
    ].join('');
    const code = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'assets', 'js', 'core', 'kc-notifications.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    (0, eval)(code);

    window.KCNotifications.init();
    window.KCNotifications.init();

    expect(document.querySelector('.kc-chat-mobile-fab')).toBeNull();
    expect(document.querySelectorAll('.kc-mobile-menu-content a[href="mensagens.html"]')).toHaveLength(1);
    expect(document.querySelector('.kc-chat-mobile-menu-link .kc-chat-shortcut__badge')).not.toBeNull();
    expect(document.querySelectorAll('.kc-user-actions .kc-chat-shortcut')).toHaveLength(1);
  });

  test('enriquece o link de Mensagens já criado pelo shell sem duplicá-lo', () => {
    document.body.innerHTML = [
      '<button class="kc-notif-bell" id="kcNotifBell"></button>',
      '<div class="kc-mobile-menu-content">',
      '  <a href="mensagens.html"><i class="fas fa-envelope"></i><span>Mensagens</span></a>',
      '</div>',
    ].join('');
    const code = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'assets', 'js', 'core', 'kc-notifications.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    (0, eval)(code);

    window.KCNotifications.init();

    expect(document.querySelectorAll('.kc-mobile-menu-content a[href="mensagens.html"]')).toHaveLength(1);
    expect(document.querySelector('.kc-chat-mobile-menu-link .kc-chat-shortcut__badge')).not.toBeNull();
  });

  test('atualiza os contadores do cabeçalho e menu por evento com getCurrentUser disponível', async () => {
    document.body.innerHTML = [
      '<div class="kc-user-actions"><button class="kc-notif-bell" id="kcNotifBell"></button></div>',
      '<div class="kc-mobile-menu-content"><a href="mensagens.html">Mensagens</a></div>',
    ].join('');
    const code = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'assets', 'js', 'core', 'kc-notifications.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    (0, eval)(code);
    window.KCNotifications.init();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(window.KCAPI.getCurrentUser).toHaveBeenCalledTimes(1);
    const badges = Array.from(document.querySelectorAll('.kc-chat-shortcut__badge'));
    expect(badges).toHaveLength(2);
    expect(badges.map((badge) => badge.textContent)).toEqual(['3', '3']);
    window.KCAPI.chat.unreadTotal.mockClear();

    document.dispatchEvent(new CustomEvent('kc:chat:unread-changed', { detail: { total: 100 } }));
    expect(badges.map((badge) => badge.textContent)).toEqual(['99+', '99+']);
    expect(badges.every((badge) => !badge.hidden)).toBe(true);

    document.dispatchEvent(new CustomEvent('kc:chat:unread-changed', { detail: { total: 0 } }));
    expect(badges.map((badge) => badge.textContent)).toEqual(['0', '0']);
    expect(badges.every((badge) => badge.hidden)).toBe(true);
    expect(window.KCAPI.chat.unreadTotal).not.toHaveBeenCalled();
  });

  test.each(['authenticated-runtime', 'without-bell', 'without-current-user-api'])(
    'registra apenas um listener de mensagens após init repetido: %s',
    async (scenario) => {
      if (scenario === 'without-bell') document.body.innerHTML = '';
      if (scenario === 'without-current-user-api') delete window.KCAPI.getCurrentUser;
      const code = fs.readFileSync(
        path.resolve(__dirname, '..', '..', 'assets', 'js', 'core', 'kc-notifications.js'),
        'utf8'
      );
      // eslint-disable-next-line no-eval
      (0, eval)(code);

      window.KCNotifications.init();
      window.KCNotifications.init();
      window.KCNotifications.init();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const unreadListeners = documentListenerSpy.mock.calls.filter(
        ([type]) => type === 'kc:chat:unread-changed'
      );
      expect(unreadListeners).toHaveLength(1);
    }
  );

  test('mantém o listener entre logout e nova sessão sem revelar contadores ao visitante', async () => {
    document.body.innerHTML = [
      '<div class="kc-user-actions"><button class="kc-notif-bell" id="kcNotifBell"></button></div>',
      '<div class="kc-mobile-menu-content"><a href="mensagens.html">Mensagens</a></div>',
    ].join('');
    const code = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'assets', 'js', 'core', 'kc-notifications.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    (0, eval)(code);
    window.KCNotifications.init();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const badges = Array.from(document.querySelectorAll('.kc-chat-shortcut__badge'));
    document.dispatchEvent(new CustomEvent('kc:authchange', { detail: { user: null } }));
    document.dispatchEvent(new CustomEvent('kc:chat:unread-changed', { detail: { total: 100 } }));
    expect(badges.every((badge) => badge.hidden && badge.textContent === '0')).toBe(true);
    expect(document.querySelectorAll('.kc-chat-shortcut')).toHaveLength(1);

    document.dispatchEvent(new CustomEvent('kc:authchange', { detail: { user: { id: 'user-2' } } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.dispatchEvent(new CustomEvent('kc:chat:unread-changed', { detail: { total: 1 } }));
    expect(badges.every((badge) => !badge.hidden && badge.textContent === '1')).toBe(true);
    expect(documentListenerSpy.mock.calls.filter(
      ([type]) => type === 'kc:chat:unread-changed'
    )).toHaveLength(1);
  });

  test('keeps read, clear and realtime actions alive after rerender', async () => {
    const code = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'assets', 'js', 'core', 'kc-notifications.js'),
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

  test('routes direct_message realtime events to chat badge without adding bell items', async () => {
    const code = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'assets', 'js', 'core', 'kc-notifications.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    (0, eval)(code);

    window.KCNotifications.init();

    await new Promise((resolve) => setTimeout(resolve, 900));
    await Promise.resolve();
    await Promise.resolve();

    window.KCNotifications.toggleDropdown();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    await Promise.resolve();

    window.KCAPI.chat.unreadTotal.mockClear();

    global.__kcNotifRealtimeCallback({
      eventType: 'INSERT',
      new: {
        id: 'dm-1',
        read: false,
        title: 'Mensagem direta',
        body: 'Nova mensagem',
        type: 'direct_message',
        created_at: '2026-04-09T13:10:00Z',
        data: { conversation_id: 'conv-1' },
      },
      old: null,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(document.querySelector('.kc-notif-item[data-notif-id="dm-1"]')).toBeNull();
    expect(window.KCAPI.chat.unreadTotal).toHaveBeenCalledTimes(1);
  });
});
