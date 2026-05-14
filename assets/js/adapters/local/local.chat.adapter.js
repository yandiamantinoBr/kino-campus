/**
 * @file local.chat.adapter.js
 * @description Stub do adapter local para Chat (v9.3.5.10+).
 *
 * Chat só funciona com driver Supabase (depende de Realtime + RLS). No driver
 * local, todas as operações retornam erro informativo. Existe apenas para
 * manter consistência da fachada KCAPI.chat — testes Jest do controller
 * podem mockar normalmente.
 */
'use strict';

(function () {
  'use strict';
  window._KCAL = window._KCAL || {};

  function notSupported() {
    return Promise.resolve({
      ok: false,
      error: { message: 'Chat só funciona com driver Supabase.' },
    });
  }

  window._KCAL.chat = {
    startConversation: notSupported,
    sendMessage: notSupported,
    uploadChatImage: notSupported,
    getPublicUrl: function () { return null; },
    getSignedUrl: function () { return Promise.resolve(null); },
    listConversations: function () { return Promise.resolve({ ok: true, data: [] }); },
    listMessages: function () { return Promise.resolve({ ok: true, data: [] }); },
    markRead: notSupported,
    unreadTotal: function () { return Promise.resolve(0); },
    deleteMessage: notSupported,
    editMessage: notSupported,
    blockUser: notSupported,
    unblockUser: notSupported,
    isBlocked: function () {
      return Promise.resolve({ ok: true, data: { i_blocked: false, they_blocked: false } });
    },
    reportMessage: notSupported,
    subscribeChat: function () { return null; },
    unsubscribeChat: function () {},
  };
})();
