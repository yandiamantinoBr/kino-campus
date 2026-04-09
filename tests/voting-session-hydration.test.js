const fs = require('fs');
const path = require('path');

describe('Voting session hydration', () => {
  const POST_ID = '550e8400-e29b-41d4-a716-446655440000';
  let currentUserId = 'user-1';

  beforeAll(() => {
    global.window = global.window || global;
    global.KC_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    global.isSupabaseRuntime = jest.fn(() => true);
    global.showToast = jest.fn();
    global.getCurrentPostId = jest.fn(() => POST_ID);
    global.KCAPI = { votePost: jest.fn() };
    global.window.KCSupabase = {
      getUser: jest.fn(() => ({ id: currentUserId })),
      getClient: jest.fn(() => ({
        rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
        from: jest.fn(),
      })),
    };
    global.window.KCSessionStore = {
      get: jest.fn(() => null),
      set: jest.fn(() => true),
      remove: jest.fn(() => true),
    };

    const filePath = path.resolve(__dirname, '..', 'assets', 'js', 'components', 'voting.js');
    const code = fs.readFileSync(filePath, 'utf-8');
    // eslint-disable-next-line no-eval
    (0, eval)(code);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    currentUserId = `user-${Math.random().toString(36).slice(2, 8)}`;
    document.body.innerHTML =
      '<div class="kc-vote-box">' +
        `<button data-action="vote-hot" data-post-id="${POST_ID}"></button>` +
        '<span data-kc-vote-score>0</span>' +
        `<button data-action="vote-cold" data-post-id="${POST_ID}"></button>` +
      '</div>';

    window.KCSupabase.getUser.mockReturnValue({ id: currentUserId });
    window.KCSupabase.getClient.mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
      from: jest.fn(),
    });
    window.KCSessionStore.get.mockImplementation((scope, key) => {
      if (scope !== 'votes') return null;
      if (key === `directions:supabase:${currentUserId}`) {
        return {
          value: { [POST_ID]: 'hot' },
          timestamp: Date.now(),
          age: 0,
        };
      }
      if (key === 'scores') {
        return {
          value: { [POST_ID]: 17 },
          timestamp: Date.now(),
          age: 0,
        };
      }
      return null;
    });
  });

  test('kcInitVoteStates reapplies cached score and direction before RPC', async () => {
    const client = {
      rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
      from: jest.fn(),
    };
    window.KCSupabase.getClient.mockReturnValue(client);

    await kcInitVoteStates();

    expect(document.querySelector('[data-kc-vote-score]').textContent).toBe('17');
    expect(document.querySelector('[data-action="vote-hot"]').classList.contains('active')).toBe(true);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  test('kcUpdateVoteScoreInDOM persists the last known score to session storage', () => {
    jest.useFakeTimers();
    window.KCSessionStore.get.mockReturnValue(null);

    kcUpdateVoteScoreInDOM(POST_ID, 23);
    jest.runAllTimers();

    expect(document.querySelector('[data-kc-vote-score]').textContent).toBe('23');
    expect(window.KCSessionStore.set).toHaveBeenCalledWith(
      'votes',
      'scores',
      expect.objectContaining({ [POST_ID]: 23 })
    );

    jest.useRealTimers();
  });
});
