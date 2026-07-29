/**
 * @file kc-api.chat.js
 * @description Façade KCAPI.chat — Chat 1-a-1 (v9.3.5.10+)
 *
 * Delega para o driver ativo (Supabase ou local). Controllers/UI devem usar
 * SEMPRE window.KCAPI.chat.* e nunca window._KCSA.chat.* diretamente.
 *
 * Padrão idêntico ao kc-api.notifications.js:
 *   - getEnvDriver(deps) detecta driver
 *   - se 'supabase' → window._KCSA.chat
 *   - caso contrário → window._KCAL.chat
 *   - reexposto em window.KCAPI.chat (e também em _KCAPI.chat para uso interno)
 */
'use strict';

(function () {
  'use strict';

  window._KCAPI = window._KCAPI || {};

  function getEnvDriver(deps) {
    if (deps && deps.driver) return String(deps.driver);
    var ENV = (window.KCAPI && window.KCAPI.ENV) || {};
    return String((ENV && ENV.driver) || 'local').toLowerCase();
  }

  function getDriver(deps) {
    var d = getEnvDriver(deps);
    if (d === 'supabase' && window._KCSA && window._KCSA.chat) return window._KCSA.chat;
    if (window._KCAL && window._KCAL.chat) return window._KCAL.chat;
    return null;
  }

  function safe(fnName) {
    return async function () {
      var args = Array.prototype.slice.call(arguments);
      var driver = getDriver();
      if (!driver || typeof driver[fnName] !== 'function') {
        return { ok: false, error: { message: 'Chat indisponível neste ambiente.' } };
      }
      try {
        return await driver[fnName].apply(driver, args);
      } catch (e) {
        return { ok: false, error: { message: (e && e.message) || String(e) } };
      }
    };
  }

  function sync(fnName, defaultValue) {
    return function () {
      var args = Array.prototype.slice.call(arguments);
      var driver = getDriver();
      if (!driver || typeof driver[fnName] !== 'function') return defaultValue;
      try {
        return driver[fnName].apply(driver, args);
      } catch (e) {
        console.warn('[KCAPI][chat]', fnName, 'falhou:', e);
        return defaultValue;
      }
    };
  }

  var chatFacade = {
    startConversation: safe('startConversation'),
    sendMessage: safe('sendMessage'),
    uploadChatImage: safe('uploadChatImage'),
    uploadChatMedia: safe('uploadChatMedia'),
    getSignedUrl: safe('getSignedUrl'),
    deleteUploadedMedia: safe('deleteUploadedMedia'),
    listConversations: safe('listConversations'),
    listMessages: safe('listMessages'),
    markRead: safe('markRead'),
    unreadTotal: async function () {
      var driver = getDriver();
      if (!driver || typeof driver.unreadTotal !== 'function') return 0;
      try { return await driver.unreadTotal(); } catch (e) { return 0; }
    },
    deleteMessage: safe('deleteMessage'),
    editMessage: safe('editMessage'),
    // V76.53: reações emoji e reply/quote
    toggleReaction: safe('toggleReaction'),
    setMessageReply: safe('setMessageReply'),
    blockUser: safe('blockUser'),
    unblockUser: safe('unblockUser'),
    isBlocked: safe('isBlocked'),
    // V76.57: excluir (arquivar) conversa para o usuário atual
    setConversationArchived: safe('setConversationArchived'),
    deleteConversation: safe('deleteConversation'),
    reportMessage: safe('reportMessage'),
    subscribeChat: sync('subscribeChat', null),
    unsubscribeChat: sync('unsubscribeChat'),
    // Indicador "digitando..." — broadcast efêmero via Realtime, sem persistir no banco.
    subscribeTyping: sync('subscribeTyping', null),
    broadcastTyping: sync('broadcastTyping'),
    unsubscribeTyping: sync('unsubscribeTyping'),
  };

  var target = window._KCAPI.chat || {};
  Object.keys(chatFacade).forEach(function (key) {
    target[key] = chatFacade[key];
  });
  window._KCAPI.chat = target;
})();
