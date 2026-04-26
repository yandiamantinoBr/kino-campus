describe('KCRanking session hydration', () => {
  let ranking;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    global.window = global.window || global;
    window.KCAPI = {
      getTopContributors: jest.fn().mockResolvedValue([]),
    };
    window.KCSessionStore = {
      get: jest.fn(() => null),
      set: jest.fn(() => true),
      remove: jest.fn(() => true),
    };
    delete window.KCRanking;
    require('../../assets/js/kc-ranking.js');
    ranking = window.KCRanking;
  });

  test('loadSidebarRanking renders a fresh session snapshot without refetching', async () => {
    const users = [{ user_id: 'user-1', display_name: 'Ana', avatar_url: '', score: 42 }];
    const signature = JSON.stringify([['user-1', 'Ana', '', 42]]);
    window.KCSessionStore.get.mockReturnValue({
      value: { users, signature },
      timestamp: Date.now(),
      age: 0,
    });

    document.body.innerHTML = '<div class="kc-ranking-sidebar-users" data-kc-ranking-module="moradia"></div>';
    const container = document.querySelector('.kc-ranking-sidebar-users');

    await ranking.loadSidebarRanking(container, 'month', 'moradia');

    expect(container.textContent).toContain('Ana');
    expect(container.textContent).toContain('42 pts');
    expect(window.KCAPI.getTopContributors).not.toHaveBeenCalled();
  });

  test('fetchRanking persists the network payload in KCSessionStore', async () => {
    const users = [{ user_id: 'user-2', display_name: 'Bruno', avatar_url: '', score: 19 }];
    window.KCAPI.getTopContributors.mockResolvedValue(users);

    const result = await ranking.fetchRanking('week', 'caronas', 10);

    expect(result.users).toEqual(users);
    expect(window.KCSessionStore.set).toHaveBeenCalledWith(
      'ranking',
      'caronas:week',
      expect.objectContaining({
        users,
        signature: expect.any(String),
      })
    );
  });
});
