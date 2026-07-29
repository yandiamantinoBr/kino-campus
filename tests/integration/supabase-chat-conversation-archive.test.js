'use strict';

function loadAdapter(rpcResult = { data: { ok: true }, error: null }) {
  jest.resetModules();

  const client = {
    from: jest.fn(),
    rpc: jest.fn().mockResolvedValue(rpcResult),
  };

  window._KCSA = {
    getClient: () => client,
    getCurrentUser: () => Promise.resolve(null),
    media: {},
  };
  window.KCAPI = { ENV: {} };

  require('../../assets/js/adapters/supabase/supabase.chat.adapter.js');

  return {
    adapter: window._KCSA.chat,
    client,
  };
}

describe('Supabase chat conversation archive boundary', () => {
  afterEach(() => {
    delete window._KCSA;
    delete window.KCAPI;
  });

  test('legacy delete delegates to the owner-bound RPC and ignores a forged browser user id', async () => {
    const runtime = loadAdapter({
      data: {
        ok: true,
        conversation_id: 'conversation-1',
        archived: true,
      },
      error: null,
    });

    await expect(
      runtime.adapter.deleteConversation('conversation-1', 'forged-user-id')
    ).resolves.toEqual({
      ok: true,
      data: {
        ok: true,
        conversation_id: 'conversation-1',
        archived: true,
      },
    });

    expect(runtime.client.rpc).toHaveBeenCalledWith(
      'kc_chat_set_conversation_archived',
      {
        p_conversation_id: 'conversation-1',
        p_archived: true,
      }
    );
    expect(runtime.client.from).not.toHaveBeenCalled();
  });

  test('explicit archive API supports unarchive through the same RPC', async () => {
    const runtime = loadAdapter({
      data: {
        ok: true,
        conversation_id: 'conversation-2',
        archived: false,
      },
      error: null,
    });

    await expect(
      runtime.adapter.setConversationArchived('conversation-2', false)
    ).resolves.toEqual({
      ok: true,
      data: {
        ok: true,
        conversation_id: 'conversation-2',
        archived: false,
      },
    });

    expect(runtime.client.rpc).toHaveBeenCalledWith(
      'kc_chat_set_conversation_archived',
      {
        p_conversation_id: 'conversation-2',
        p_archived: false,
      }
    );
  });

  test('invalid state is rejected before any network or table call', async () => {
    const runtime = loadAdapter();

    await expect(
      runtime.adapter.setConversationArchived('conversation-3', 'true')
    ).resolves.toEqual({
      ok: false,
      error: { message: 'Parâmetros inválidos.' },
    });

    expect(runtime.client.rpc).not.toHaveBeenCalled();
    expect(runtime.client.from).not.toHaveBeenCalled();
  });

  test('RPC failures are returned without falling back to direct table mutation', async () => {
    const runtime = loadAdapter({
      data: null,
      error: { message: 'session_inactive' },
    });

    await expect(
      runtime.adapter.setConversationArchived('conversation-4', true)
    ).resolves.toEqual({
      ok: false,
      error: { message: 'session_inactive' },
    });

    expect(runtime.client.from).not.toHaveBeenCalled();
  });
});
