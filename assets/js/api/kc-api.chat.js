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
    getPublicUrl: sync('getPublicUrl', null),
    getSignedUrl: safe('getSignedUrl'),
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
    blockUser: safe('blockUser'),
    unblockUser: safe('unblockUser'),
    isBlocked: safe('isBlocked'),
    reportMessage: safe('reportMessage'),
    subscribeChat: sync('subscribeChat', null),
    unsubscribeChat: sync('unsubscribeChat'),
  };

  window._KCAPI.chat = chatFacade;

  // Auto-registra em window.KCAPI quando kc-api.client.js terminar de carregar
  function exposeOnFacade() {
    if (window.KCAPI) {
      window.KCAPI.chat = chatFacade;
    }
  }
  if (window.KCAPI) {
    exposeOnFacade();
  } else {
    document.addEventListener('kc:apiready', exposeOnFacade, { once: true });
    // Fallback: polling curto
    var tries = 0;
    var iv = setInterval(function () {
      tries += 1;
      if (window.KCAPI) {
        exposeOnFacade();
        clearInterval(iv);
      } else if (tries > 50) {
        clearInterval(iv);
      }
    }, 100);
  }
})();
