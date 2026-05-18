/**
 * @file chat-inbox.controller.js
 * @description Controller principal de Mensagens (v9.3.5.10+)
 *
 * Padrões respeitados:
 *  - IIFE 'use strict', estado privado em `state`
 *  - DOM via document.getElementById / querySelector
 *  - Sanitização SEMPRE via window.KCUtils.escapeHtml
 *  - Sessão via window.KCSupabase.getCurrentUser() / KCAPI.getMyProfile
 *  - API via window.KCAPI.chat.* (driver-agnostic)
 *  - Realtime via window.KCAPI.chat.subscribeChat
 *  - i18n via window.KCi18n.t (com fallback inline)
 *  - Toast via window.KCToast (fallback alert se ausente)
 *
 * Fluxo:
 *  1. init() valida sessão, lê ?with=<user_id> do query, carrega conversas
 *  2. Se ?with → start_conversation idempotente, abre o painel
 *  3. Subscribe realtime no canal chat:<my_user_id>
 *  4. Composer envia mensagem (texto/imagem) via KCAPI.chat.sendMessage
 *  5. Ao receber via realtime → append na lista atual ou bump na inbox
 */
'use strict';

(function () {
  'use strict';

  const VERSION = '9.3.5.16';
  const PAGE_SIZE_CONV = 50;
  const PAGE_SIZE_MSG = 50;
  const AUTH_BOOT_TIMEOUT_MS = 8000;
  const CHAT_REQUEST_TIMEOUT_MS = 12000;

  const state = {
    me: null,
    profile: null,
    conversations: [],          // [{conversation_id, other_user_id, ...}]
    convById: new Map(),
    activeConvId: null,
    activePeer: null,           // {id, display_name, avatar_url}
    messages: [],               // mensagens da conversa ativa (asc)
    messagesById: new Map(),
    hasMoreMessages: false,
    isLoadingMessages: false,
    isLoadingMore: false,
    isSending: false,
    pendingFile: null,
    previewObjectUrl: null,
    rtChannel: null,
    blocked: { i_blocked: false, they_blocked: false },
    conversationQuery: '',
    inboxReloadTimer: null,
    authRestartTimer: null,
    bootPromise: null,
    eventsBound: false,
    beforeUnloadBound: false,
    initialRouteApplied: false,
    conversationLoadToken: 0,
    messageLoadToken: 0,
    pendingActiveUnread: 0,
  };
  const signedMediaCache = new Map();

  // ── Utilitários ─────────────────────────────────────────────────────────

  function $(id) { return document.getElementById(id); }
  function $$(sel, root) { return (root || document).querySelector(sel); }

  function esc(s) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(String(s == null ? '' : s));
    }
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function t(key, fallback, params) {
    if (window.KCi18n && typeof window.KCi18n.t === 'function') {
      var v = window.KCi18n.t(key, params);
      if (v && v !== key) return v;
    }
    return fallback;
  }

  function toast(message, type) {
    if (window.KCToast && typeof window.KCToast.show === 'function') {
      window.KCToast.show(message, type || 'info');
    } else if (window.showToast) {
      window.showToast(message, type || 'info');
    } else {
      console.log('[chat][toast]', type || 'info', message);
    }
  }

  function getQuery(name) {
    try {
      var url = new URL(window.location.href);
      return url.searchParams.get(name);
    } catch (_) { return null; }
  }

  function getHash() {
    return String(window.location.hash || '').replace(/^#/, '');
  }

  function setHash(val) {
    var current = String(window.location.hash || '');
    if (current === '#' + val || (val === '' && current === '')) return;
    history.replaceState(null, '', val ? '#' + val : window.location.pathname + window.location.search);
  }

  function formatTime(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      var now = new Date();
      var sameDay = d.toDateString() === now.toDateString();
      if (sameDay) {
        return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      }
      var yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) return 'ontem';
      var diffDays = Math.floor((now - d) / 86400000);
      if (diffDays < 7) {
        return d.toLocaleDateString('pt-BR', { weekday: 'short' });
      }
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } catch (_) { return ''; }
  }

  function formatDayLabel(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Hoje';
    var yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }

  function getInitials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function avatarHTML(url, name, sizeClass) {
    if (url) {
      return '<img src="' + esc(url) + '" alt="" />';
    }
    return esc(getInitials(name));
  }

  function mediaState(path) {
    if (!path) return { status: 'missing', url: null };
    var cached = signedMediaCache.get(path);
    var now = Date.now();
    if (cached && cached.url && cached.expiresAt > now) return { status: 'ready', url: cached.url };
    if (cached && cached.pending) return { status: 'loading', url: null };
    if (cached && cached.failedAt && (now - cached.failedAt) < 30000) {
      return { status: 'failed', url: null };
    }
    loadSignedMediaUrl(path);
    return { status: 'loading', url: null };
  }

  function loadSignedMediaUrl(path) {
    if (!path || !window.KCAPI || !window.KCAPI.chat || typeof window.KCAPI.chat.getSignedUrl !== 'function') return;
    signedMediaCache.set(path, { pending: true, expiresAt: 0 });
    Promise.resolve(window.KCAPI.chat.getSignedUrl(path, 3600)).then(function (url) {
      if (!url || typeof url !== 'string') {
        signedMediaCache.set(path, { url: null, pending: false, failedAt: Date.now(), expiresAt: 0 });
        renderMessagesList();
        return;
      }
      signedMediaCache.set(path, {
        url: url,
        pending: false,
        expiresAt: Date.now() + (55 * 60 * 1000),
      });
      renderMessagesList();
    }).catch(function () {
      signedMediaCache.set(path, { url: null, pending: false, failedAt: Date.now(), expiresAt: 0 });
      renderMessagesList();
    });
  }

  async function cleanupUploadedChatImage(path) {
    if (!path || !window.KCAPI || !window.KCAPI.chat || typeof window.KCAPI.chat.deleteUploadedMedia !== 'function') return;
    try { await window.KCAPI.chat.deleteUploadedMedia(path); } catch (_) {}
  }

  function clearPreviewObjectUrl() {
    if (!state.previewObjectUrl || !window.URL || typeof window.URL.revokeObjectURL !== 'function') return;
    try { window.URL.revokeObjectURL(state.previewObjectUrl); } catch (_) {}
    state.previewObjectUrl = null;
  }

  function draftKey(convId) {
    var uid = state.me && state.me.id ? state.me.id : 'anon';
    return 'kc:chat:draft:' + uid + ':' + convId;
  }

  function getDraft(convId) {
    if (!convId || !window.localStorage) return '';
    try { return window.localStorage.getItem(draftKey(convId)) || ''; } catch (_) { return ''; }
  }

  function saveDraft(convId) {
    if (!convId || !window.localStorage) return;
    var input = $('kcChatInput');
    var value = input ? String(input.value || '') : '';
    try {
      if (value.trim()) window.localStorage.setItem(draftKey(convId), value);
      else window.localStorage.removeItem(draftKey(convId));
    } catch (_) {}
  }

  function clearDraft(convId) {
    if (!convId || !window.localStorage) return;
    try { window.localStorage.removeItem(draftKey(convId)); } catch (_) {}
  }

  function isNearBottom() {
    var wrap = $('kcChatMessages');
    if (!wrap) return true;
    return (wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight) < 120;
  }

  function setJumpVisible(visible) {
    var btn = $('kcChatJumpBtn');
    if (!btn) return;
    btn.hidden = !visible;
  }

  function scheduleLoadConversations() {
    if (state.inboxReloadTimer) clearTimeout(state.inboxReloadTimer);
    state.inboxReloadTimer = setTimeout(function () {
      state.inboxReloadTimer = null;
      loadConversations();
    }, 220);
  }

  function isPaneMobile() {
    return window.matchMedia('(max-width: 1023px)').matches;
  }

  function setActivePane(pane) {
    var page = $('kcChatPage');
    if (page) page.setAttribute('data-pane', pane);
  }

  function makeTimeoutError(label) {
    var err = new Error(label || 'timeout');
    err.code = 'KC_TIMEOUT';
    return err;
  }

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(makeTimeoutError(label));
      }, ms);

      function finish(fn, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      }

      Promise.resolve(promise).then(function (value) {
        finish(resolve, value);
      }, function (err) {
        finish(reject, err);
      });
    });
  }

  function normalizeAuthUser(user) {
    if (!user || !user.id) return null;
    return {
      id: String(user.id),
      email: user.email || '',
    };
  }

  function readCachedAuthUser() {
    if (!window.KCSupabase) return null;
    try {
      if (typeof window.KCSupabase.getUser === 'function') {
        var user = normalizeAuthUser(window.KCSupabase.getUser());
        if (user) return user;
      }
    } catch (_) {}
    try {
      if (typeof window.KCSupabase.getSession === 'function') {
        var session = window.KCSupabase.getSession();
        var sessionUser = normalizeAuthUser(session && session.user);
        if (sessionUser) return sessionUser;
      }
    } catch (_) {}
    return null;
  }

  async function resolveCurrentUser() {
    var cached = readCachedAuthUser();
    if (cached) return { user: cached, timedOut: false };

    if (!window.KCSupabase || typeof window.KCSupabase.getCurrentUser !== 'function') {
      return { user: null, timedOut: false };
    }

    try {
      var user = await withTimeout(
        window.KCSupabase.getCurrentUser(),
        AUTH_BOOT_TIMEOUT_MS,
        'auth_timeout'
      );
      return { user: normalizeAuthUser(user), timedOut: false };
    } catch (err) {
      var fallback = readCachedAuthUser();
      if (fallback) return { user: fallback, timedOut: true };
      console.warn('[chat] getCurrentUser timeout/falhou:', err && err.message || err);
      return { user: null, timedOut: !!(err && err.code === 'KC_TIMEOUT'), error: err };
    }
  }

  function resetSessionState() {
    state.me = null;
    state.profile = null;
    state.conversations = [];
    state.convById.clear();
    state.activeConvId = null;
    state.activePeer = null;
    state.messages = [];
    state.messagesById.clear();
    state.hasMoreMessages = false;
    state.isLoadingMessages = false;
    state.isLoadingMore = false;
    state.isSending = false;
    state.pendingFile = null;
    state.blocked = { i_blocked: false, they_blocked: false };
    state.pendingActiveUnread = 0;
    state.initialRouteApplied = false;
    state.conversationLoadToken += 1;
    state.messageLoadToken += 1;
    signedMediaCache.clear();
    clearPreviewObjectUrl();
    setJumpVisible(false);
    setActivePane('list');
    setHash('');
    var empty = $('kcChatEmptyPanel');
    var active = $('kcChatActiveConv');
    if (empty) empty.style.display = 'flex';
    if (active) active.style.display = 'none';
  }

  // ── Auth + boot ─────────────────────────────────────────────────────────

  async function init() {
    bindEvents();
    if (state.bootPromise) return state.bootPromise;

    state.bootPromise = boot().finally(function () {
      state.bootPromise = null;
    });
    return state.bootPromise;
  }

  async function boot() {
    var auth = await resolveCurrentUser();
    if (!auth.user || !auth.user.id) {
      renderEmptyList(auth.timedOut ? 'auth_timeout' : 'login_required');
      return;
    }
    await startForUser(auth.user);
  }

  async function startForUser(user) {
    user = normalizeAuthUser(user);
    if (!user || !user.id) {
      renderEmptyList('login_required');
      return;
    }

    var nextId = String(user.id);
    var currentId = state.me && state.me.id ? String(state.me.id) : '';

    if (currentId && currentId !== nextId) {
      cleanup();
      resetSessionState();
    }

    state.me = { id: nextId, email: user.email || (state.me && state.me.email) || '' };

    // Carrega perfil próprio
    if (!state.profile && window.KCAPI && typeof window.KCAPI.getMyProfile === 'function') {
      try {
        state.profile = await withTimeout(
          window.KCAPI.getMyProfile(),
          CHAT_REQUEST_TIMEOUT_MS,
          'profile_timeout'
        );
      } catch (err) {
        console.warn('[chat] getMyProfile timeout/falhou:', err && err.message || err);
      }
    }

    // Inicia subscribe realtime
    if (!state.rtChannel && window.KCAPI && window.KCAPI.chat && typeof window.KCAPI.chat.subscribeChat === 'function') {
      state.rtChannel = window.KCAPI.chat.subscribeChat(state.me.id, handleRealtime);
    }

    // Carrega conversas
    var loaded = await loadConversations();

    // Verifica query ?with=<user_id> → inicia conversa
    if (loaded && !state.initialRouteApplied) {
      state.initialRouteApplied = true;
      var withParam = getQuery('with');
      if (withParam) {
        await openConversationWith(withParam);
      } else {
        // Verifica hash #c/<conv_id> → abre conversa direto
        var hash = getHash();
        if (hash.indexOf('c/') === 0) {
          var cid = hash.slice(2);
          if (cid) selectConversation(cid);
        }
      }
    }

    // Cleanup ao sair
    if (!state.beforeUnloadBound) {
      state.beforeUnloadBound = true;
      window.addEventListener('beforeunload', cleanup);
    }
  }

  function cleanup() {
    if (state.inboxReloadTimer) {
      clearTimeout(state.inboxReloadTimer);
      state.inboxReloadTimer = null;
    }
    saveDraft(state.activeConvId);
    clearPreviewObjectUrl();
    if (state.rtChannel && window.KCAPI && window.KCAPI.chat && typeof window.KCAPI.chat.unsubscribeChat === 'function') {
      try { window.KCAPI.chat.unsubscribeChat(state.rtChannel); } catch (_) {}
      state.rtChannel = null;
    }
  }

  // ── Conversas (sidebar) ─────────────────────────────────────────────────

  async function loadConversations() {
    if (!window.KCAPI || !window.KCAPI.chat) {
      renderEmptyList('error');
      return false;
    }
    if (!state.me || !state.me.id) return false;

    var token = ++state.conversationLoadToken;
    var r = null;
    try {
      r = await withTimeout(
        window.KCAPI.chat.listConversations({ limit: PAGE_SIZE_CONV }),
        CHAT_REQUEST_TIMEOUT_MS,
        'chat_list_conversations_timeout'
      );
    } catch (err) {
      if (token !== state.conversationLoadToken) return false;
      console.warn('[chat] listConversations timeout/falhou:', err && err.message || err);
      renderEmptyList('timeout');
      return false;
    }
    if (token !== state.conversationLoadToken) return false;
    if (!r || !r.ok) {
      console.warn('[chat] listConversations failed:', r && r.error);
      renderEmptyList('error');
      return false;
    }
    state.conversations = r.data || [];
    state.convById.clear();
    state.conversations.forEach(function (c) { state.convById.set(c.conversation_id, c); });
    renderConversationsList();
    dispatchUnreadChange();
    return true;
  }

  function renderConversationsList() {
    var list = $('kcChatList');
    if (!list) return;
    if (state.conversations.length === 0) {
      list.innerHTML = '<div class="kc-chat-empty" style="height:100%">' +
        '<div class="kc-chat-empty__icon"><i class="fas fa-inbox"></i></div>' +
        '<h2 class="kc-chat-empty__title">Sem conversas ainda</h2>' +
        '<p class="kc-chat-empty__body">Abra o perfil de alguém na comunidade e clique em <strong>Conversar</strong> para começar.</p>' +
        '</div>';
      return;
    }
    var query = String(state.conversationQuery || '').trim().toLowerCase();
    var visibleConversations = query
      ? state.conversations.filter(function (c) {
        var haystack = [
          c.other_display_name,
          c.last_message_preview,
          c.last_message_type === 'image' ? 'imagem foto anexo' : ''
        ].join(' ').toLowerCase();
        return haystack.indexOf(query) >= 0;
      })
      : state.conversations;

    if (visibleConversations.length === 0) {
      list.innerHTML = '<div class="kc-chat-empty" style="height:100%">' +
        '<div class="kc-chat-empty__icon"><i class="fas fa-search"></i></div>' +
        '<h2 class="kc-chat-empty__title">Nenhuma conversa encontrada</h2>' +
        '<p class="kc-chat-empty__body">Tente buscar pelo nome da pessoa ou por um trecho da mensagem.</p>' +
        '</div>';
      return;
    }

    var html = visibleConversations.map(function (c) {
      var preview = c.last_message_preview || (c.last_message_type === 'image' ? '[imagem]' : 'Sem mensagens ainda');
      var time = formatTime(c.last_message_at);
      var badge = c.unread_count > 0
        ? '<span class="kc-chat-conv-item__badge">' + (c.unread_count > 99 ? '99+' : c.unread_count) + '</span>'
        : '';
      var isActive = c.conversation_id === state.activeConvId ? ' is-active' : '';
      var isImagePreview = c.last_message_type === 'image' ? ' is-image' : '';
      return '<a href="#c/' + esc(c.conversation_id) + '" ' +
        'class="kc-chat-conv-item' + isActive + '" ' +
        'role="listitem" ' +
        'data-conv-id="' + esc(c.conversation_id) + '" ' +
        'data-peer-id="' + esc(c.other_user_id) + '">' +
        '<div class="kc-chat-conv-item__avatar">' + avatarHTML(c.other_avatar_url, c.other_display_name) + '</div>' +
        '<div class="kc-chat-conv-item__body">' +
          '<span class="kc-chat-conv-item__name">' + esc(c.other_display_name) + '</span>' +
          '<span class="kc-chat-conv-item__preview' + isImagePreview + '">' + esc(preview) + '</span>' +
        '</div>' +
        '<div class="kc-chat-conv-item__meta">' +
          (time ? '<span class="kc-chat-conv-item__time">' + esc(time) + '</span>' : '') +
          badge +
        '</div>' +
      '</a>';
    }).join('');
    list.innerHTML = html;

    // Click handlers
    Array.prototype.forEach.call(list.querySelectorAll('[data-conv-id]'), function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        var convId = el.getAttribute('data-conv-id');
        if (convId) {
          selectConversation(convId);
        }
      });
    });
  }

  function renderEmptyList(reason) {
    var list = $('kcChatList');
    if (!list) return;
    var html;
    if (reason === 'login_required') {
      html = '<div class="kc-chat-empty" style="height:100%">' +
        '<div class="kc-chat-empty__icon"><i class="fas fa-user-lock"></i></div>' +
        '<h2 class="kc-chat-empty__title">Faça login para ver suas mensagens</h2>' +
        '<p class="kc-chat-empty__body"><a href="index.html" style="color:var(--kc-primary-brand);font-weight:700;">Voltar ao início</a></p>' +
        '</div>';
    } else if (reason === 'timeout' || reason === 'auth_timeout') {
      html = '<div class="kc-chat-empty" style="height:100%">' +
        '<div class="kc-chat-empty__icon"><i class="fas fa-wifi"></i></div>' +
        '<h2 class="kc-chat-empty__title">Conexão lenta</h2>' +
        '<p class="kc-chat-empty__body">Não foi possível carregar suas mensagens agora. Tente atualizar a página em alguns instantes.</p>' +
        '</div>';
    } else {
      html = '<div class="kc-chat-empty" style="height:100%">' +
        '<div class="kc-chat-empty__icon"><i class="fas fa-exclamation-triangle"></i></div>' +
        '<h2 class="kc-chat-empty__title">Não foi possível carregar</h2>' +
        '<p class="kc-chat-empty__body">Verifique sua conexão e atualize a página.</p>' +
        '</div>';
    }
    list.innerHTML = html;
  }

  // ── Abrir conversa específica ───────────────────────────────────────────

  async function openConversationWith(otherUserId) {
    if (!window.KCAPI || !window.KCAPI.chat) return;
    if (state.me && otherUserId === state.me.id) {
      toast('Você não pode conversar consigo mesmo.', 'warn');
      return;
    }
    var r = await window.KCAPI.chat.startConversation(otherUserId);
    if (!r || !r.ok) {
      toast((r && r.error && r.error.message) || 'Não foi possível iniciar a conversa.', 'error');
      return;
    }
    var convId = r.data.conversation_id;
    // Se a conversa é nova, recarrega lista para mostrá-la
    if (r.data.is_new || !state.convById.has(convId)) {
      await loadConversations();
    }
    selectConversation(convId);
  }

  async function selectConversation(convId) {
    if (!convId) return;
    if (state.activeConvId && state.activeConvId !== convId) {
      saveDraft(state.activeConvId);
    }
    state.activeConvId = convId;
    state.pendingActiveUnread = 0;
    setJumpVisible(false);
    setHash('c/' + convId);
    setActivePane('conversation');

    // Atualiza estilo da lista
    renderConversationsList();

    var conv = state.convById.get(convId);
    if (conv) {
      state.activePeer = {
        id: conv.other_user_id,
        display_name: conv.other_display_name,
        avatar_url: conv.other_avatar_url,
      };
      renderPanelHeader();
    }

    // Mostra área da conversa, esconde "empty"
    var empty = $('kcChatEmptyPanel');
    var active = $('kcChatActiveConv');
    if (empty) empty.style.display = 'none';
    if (active) active.style.display = 'flex';

    // Loadings
    state.messages = [];
    state.messagesById.clear();
    var mwrap = $('kcChatMessages');
    if (mwrap) mwrap.innerHTML = '<div class="kc-chat-skeleton-item"><div class="kc-chat-skeleton-circle"></div><div><div class="kc-chat-skeleton-line"></div><div class="kc-chat-skeleton-line"></div></div></div>';

    // Carrega mensagens
    await loadMessages();

    // Verifica bloqueio
    await checkBlocked();

    // Marca como lida (até a última msg)
    if (state.messages.length > 0) {
      var last = state.messages[state.messages.length - 1];
      await markActiveConversationRead(last.message_id);
    }

    restoreActiveDraft();

    // Foca composer
    setTimeout(function () {
      var input = $('kcChatInput');
      if (input && !isPaneMobile()) input.focus();
    }, 100);
  }

  function renderPanelHeader() {
    if (!state.activePeer) return;
    var name = $('kcChatPeerName');
    var status = $('kcChatPeerStatus');
    var avatarEl = $('kcChatPeerAvatar');
    if (name) name.textContent = state.activePeer.display_name || 'Usuário';
    if (status) status.textContent = '';  // futuro: online/última vez
    if (avatarEl) {
      avatarEl.innerHTML = avatarHTML(state.activePeer.avatar_url, state.activePeer.display_name);
    }
  }

  // ── Mensagens ───────────────────────────────────────────────────────────

  async function loadMessages() {
    if (!state.activeConvId) return;
    state.isLoadingMessages = true;
    var convId = state.activeConvId;
    var token = ++state.messageLoadToken;
    var r = null;
    try {
      r = await withTimeout(
        window.KCAPI.chat.listMessages(convId, { limit: PAGE_SIZE_MSG }),
        CHAT_REQUEST_TIMEOUT_MS,
        'chat_list_messages_timeout'
      );
    } catch (err) {
      if (token !== state.messageLoadToken || convId !== state.activeConvId) return;
      state.isLoadingMessages = false;
      toast('Erro ao carregar mensagens.', 'error');
      renderMessagesError();
      return;
    }
    if (token !== state.messageLoadToken || convId !== state.activeConvId) return;
    state.isLoadingMessages = false;
    if (!r || !r.ok) {
      toast('Erro ao carregar mensagens.', 'error');
      renderMessagesError();
      return;
    }
    state.messages = r.data || [];
    state.messages.forEach(function (m) { state.messagesById.set(m.message_id, m); });
    state.hasMoreMessages = state.messages.length >= PAGE_SIZE_MSG;
    renderMessagesList();
    scrollToBottom();
  }

  async function loadMoreMessages() {
    if (state.isLoadingMore || !state.hasMoreMessages || state.messages.length === 0) return;
    state.isLoadingMore = true;
    var oldestTs = state.messages[0].created_at;
    var r = null;
    try {
      r = await withTimeout(
        window.KCAPI.chat.listMessages(state.activeConvId, {
          limit: PAGE_SIZE_MSG,
          before_ts: oldestTs,
        }),
        CHAT_REQUEST_TIMEOUT_MS,
        'chat_list_more_messages_timeout'
      );
    } catch (_) {
      state.isLoadingMore = false;
      return;
    }
    state.isLoadingMore = false;
    if (!r || !r.ok) return;
    var older = r.data || [];
    if (older.length === 0) { state.hasMoreMessages = false; return; }
    older.forEach(function (m) { state.messagesById.set(m.message_id, m); });
    var wrap = $('kcChatMessages');
    var prevHeight = wrap ? wrap.scrollHeight : 0;
    state.messages = older.concat(state.messages);
    state.hasMoreMessages = older.length >= PAGE_SIZE_MSG;
    renderMessagesList();
    if (wrap) {
      wrap.scrollTop = wrap.scrollHeight - prevHeight;
    }
  }

  async function markActiveConversationRead(messageId) {
    if (!state.activeConvId || !window.KCAPI || !window.KCAPI.chat) return;
    try { await window.KCAPI.chat.markRead(state.activeConvId, messageId || null); } catch (_) {}
    var conv = state.convById.get(state.activeConvId);
    if (conv) {
      conv.unread_count = 0;
      renderConversationsList();
      dispatchUnreadChange();
    }
    state.pendingActiveUnread = 0;
    setJumpVisible(false);
  }

  function restoreActiveDraft() {
    var input = $('kcChatInput');
    if (!input || !state.activeConvId) return;
    input.value = getDraft(state.activeConvId);
    autoGrow();
    updateSendBtnState();
  }

  function renderMessagesList() {
    var wrap = $('kcChatMessages');
    if (!wrap) return;

    if (state.messages.length === 0) {
      wrap.innerHTML = '<div class="kc-chat-empty" style="height:100%;flex:1;">' +
        '<div class="kc-chat-empty__icon"><i class="fas fa-comment"></i></div>' +
        '<h2 class="kc-chat-empty__title">Diga olá!</h2>' +
        '<p class="kc-chat-empty__body">Envie a primeira mensagem para começar a conversa.</p>' +
        '</div>';
      return;
    }

    var html = '';
    var lastDate = null;
    state.messages.forEach(function (m) {
      var d = new Date(m.created_at);
      var dayKey = d.toDateString();
      if (dayKey !== lastDate) {
        html += '<div class="kc-chat-day-divider">' + esc(formatDayLabel(m.created_at)) + '</div>';
        lastDate = dayKey;
      }
      html += renderMessageBubble(m);
    });
    wrap.innerHTML = html;

    // Bind context menu de mensagens próprias
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-msg-menu]'), function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var msgId = btn.getAttribute('data-msg-menu');
        var action = btn.getAttribute('data-action');
        if (action === 'delete') handleDeleteMessage(msgId);
        else if (action === 'edit') handleEditMessage(msgId);
        else if (action === 'report') handleReportMessage(msgId);
      });
    });

    // Click em imagens abre full-screen
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-image-full]'), function (img) {
      img.addEventListener('click', function () {
        window.open(img.getAttribute('data-image-full'), '_blank', 'noopener');
      });
      img.addEventListener('error', function () {
        var path = img.getAttribute('data-image-path');
        if (!path) return;
        signedMediaCache.set(path, { url: null, pending: false, failedAt: Date.now(), expiresAt: 0 });
        renderMessagesList();
      });
    });

    Array.prototype.forEach.call(wrap.querySelectorAll('[data-media-retry]'), function (btn) {
      btn.addEventListener('click', function () {
        var path = btn.getAttribute('data-media-retry');
        if (!path) return;
        signedMediaCache.delete(path);
        loadSignedMediaUrl(path);
        renderMessagesList();
      });
    });
  }

  function renderMessagesError() {
    var wrap = $('kcChatMessages');
    if (!wrap) return;
    wrap.innerHTML = '<div class="kc-chat-empty" style="height:100%;flex:1;">' +
      '<div class="kc-chat-empty__icon"><i class="fas fa-exclamation-triangle"></i></div>' +
      '<h2 class="kc-chat-empty__title">Não foi possível carregar</h2>' +
      '<p class="kc-chat-empty__body">Tente abrir a conversa novamente em alguns instantes.</p>' +
      '</div>';
  }

  function renderMessageBubble(m) {
    var isMine = state.me && m.sender_id === state.me.id;
    var classes = 'kc-chat-msg ' + (isMine ? 'kc-chat-msg--mine' : 'kc-chat-msg--other');
    if (m.deleted_at) classes += ' kc-chat-msg--deleted';
    var content = '';
    if (m.deleted_at) {
      content = '<em>Mensagem apagada</em>';
    } else if (m.message_type === 'image' && m.media_path) {
      var media = mediaState(m.media_path);
      if (media.status === 'ready' && media.url) {
        content += '<img class="kc-chat-msg__image" src="' + esc(media.url) + '" data-image-full="' + esc(media.url) + '" data-image-path="' + esc(m.media_path) + '" alt="Imagem" />';
      } else if (media.status === 'failed') {
        content += '<button type="button" class="kc-chat-msg__image-placeholder is-error" data-media-retry="' + esc(m.media_path) + '"><i class="fas fa-image"></i><span>Imagem indisponível. Tentar novamente</span></button>';
      } else {
        content += '<div class="kc-chat-msg__image-placeholder" aria-busy="true"><i class="fas fa-image"></i><span>Carregando imagem...</span></div>';
      }
      if (m.content) {
        content += '<div>' + esc(m.content) + '</div>';
      }
    } else {
      content = esc(m.content || '');
    }
    var meta = '<span class="kc-chat-msg__meta">';
    if (m.edited_at) meta += '<span class="kc-chat-msg__edited">editada</span> · ';
    meta += esc(formatTime(m.created_at));
    meta += '</span>';

    var menu = '';
    if (!m.deleted_at) {
      if (isMine) {
        menu = '<span class="kc-chat-msg__menu">' +
          (m.message_type === 'text' ?
            '<button class="kc-chat-msg__menu-btn" data-msg-menu="' + esc(m.message_id) + '" data-action="edit" title="Editar"><i class="fas fa-pen"></i></button>' : '') +
          '<button class="kc-chat-msg__menu-btn" data-msg-menu="' + esc(m.message_id) + '" data-action="delete" title="Apagar"><i class="fas fa-trash"></i></button>' +
        '</span>';
      } else {
        menu = '<span class="kc-chat-msg__menu">' +
          '<button class="kc-chat-msg__menu-btn" data-msg-menu="' + esc(m.message_id) + '" data-action="report" title="Denunciar"><i class="fas fa-flag"></i></button>' +
        '</span>';
      }
    }

    return '<div class="' + classes + '" data-msg-id="' + esc(m.message_id) + '">' +
      content + meta + menu +
    '</div>';
  }

  function scrollToBottom() {
    var wrap = $('kcChatMessages');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }

  function appendMessage(m, opts) {
    if (!m || state.messagesById.has(m.message_id || m.id)) return;
    var options = opts || {};
    var normalized = {
      message_id: m.message_id || m.id,
      sender_id: m.sender_id,
      message_type: m.message_type,
      content: m.content,
      media_path: m.media_path,
      created_at: m.created_at,
      edited_at: m.edited_at || null,
      deleted_at: m.deleted_at || null,
    };
    state.messagesById.set(normalized.message_id, normalized);
    state.messages.push(normalized);
    renderMessagesList();
    if (options.scroll !== false) scrollToBottom();
  }

  // ── Composer (enviar) ───────────────────────────────────────────────────

  async function handleSubmit(event) {
    if (event) event.preventDefault();
    if (state.isSending) return;
    if (!state.activeConvId) return;
    if (state.blocked.i_blocked || state.blocked.they_blocked) {
      toast('Não é possível enviar mensagens nesta conversa.', 'warn');
      return;
    }

    var input = $('kcChatInput');
    var content = (input && input.value || '').trim();
    var hasImage = !!state.pendingFile;

    if (!content && !hasImage) return;

    state.isSending = true;
    var sendBtn = $('kcChatSendBtn');
    if (sendBtn) sendBtn.disabled = true;

    try {
      if (hasImage) {
        var up = await window.KCAPI.chat.uploadChatImage(state.activeConvId, state.pendingFile);
        if (!up || !up.ok) {
          toast((up && up.error && up.error.message) || 'Falha no upload.', 'error');
          return;
        }
        var sendImg = await window.KCAPI.chat.sendMessage(state.activeConvId, {
          message_type: 'image',
          content: content || null,
          media_path: up.data.path,
        });
        if (!sendImg || !sendImg.ok) {
          await cleanupUploadedChatImage(up.data && up.data.path);
          toast((sendImg && sendImg.error && sendImg.error.message) || 'Falha ao enviar imagem.', 'error');
          return;
        }
        // Adiciona localmente (realtime também trará, mas o set evita duplicar)
        appendMessage({
          message_id: sendImg.data.message_id,
          sender_id: state.me.id,
          message_type: 'image',
          content: content || null,
          media_path: up.data.path,
          created_at: sendImg.data.created_at,
        });
      } else {
        var sendTxt = await window.KCAPI.chat.sendMessage(state.activeConvId, {
          message_type: 'text',
          content: content,
          media_path: null,
        });
        if (!sendTxt || !sendTxt.ok) {
          var msg = (sendTxt && sendTxt.error && sendTxt.error.message) || 'Falha ao enviar.';
          if (msg.indexOf('rate_limit') >= 0) msg = 'Você está enviando muito rápido. Aguarde alguns segundos.';
          else if (msg.indexOf('blocked') >= 0) msg = 'Esta conversa está bloqueada.';
          toast(msg, 'error');
          return;
        }
        appendMessage({
          message_id: sendTxt.data.message_id,
          sender_id: state.me.id,
          message_type: 'text',
          content: content,
          created_at: sendTxt.data.created_at,
        });
      }

      // Limpa composer
      if (input) input.value = '';
      clearDraft(state.activeConvId);
      autoGrow();
      state.pendingFile = null;
      renderComposerPreview();
      updateSendBtnState();
    } finally {
      state.isSending = false;
      var sb = $('kcChatSendBtn');
      if (sb) sb.disabled = false;
      updateSendBtnState();
    }
  }

  function renderComposerPreview() {
    var composer = $('kcChatComposer');
    if (!composer) return;
    var existing = composer.querySelector('.kc-chat-composer__preview');
    if (existing) existing.remove();
    clearPreviewObjectUrl();
    if (!state.pendingFile) return;
    var url = URL.createObjectURL(state.pendingFile);
    state.previewObjectUrl = url;
    var preview = document.createElement('div');
    preview.className = 'kc-chat-composer__preview';
    preview.innerHTML =
      '<img class="kc-chat-composer__preview-img" src="' + esc(url) + '" alt="Pré-visualização"/>' +
      '<div class="kc-chat-composer__preview-info">' + esc(state.pendingFile.name || 'imagem') + '</div>' +
      '<button type="button" class="kc-chat-composer__preview-remove" aria-label="Remover">✕</button>';
    preview.querySelector('.kc-chat-composer__preview-remove').addEventListener('click', function () {
      state.pendingFile = null;
      renderComposerPreview();
      updateSendBtnState();
    });
    composer.insertBefore(preview, composer.firstChild);
  }

  function updateSendBtnState() {
    var input = $('kcChatInput');
    var sb = $('kcChatSendBtn');
    if (!sb) return;
    var hasContent = (input && input.value && input.value.trim().length > 0) || !!state.pendingFile;
    sb.disabled = !hasContent || state.isSending || state.blocked.i_blocked || state.blocked.they_blocked;
  }

  function autoGrow() {
    var ta = $('kcChatInput');
    if (!ta) return;
    ta.style.height = 'auto';
    var newH = Math.min(ta.scrollHeight, 144);
    ta.style.height = newH + 'px';
  }

  // ── Bloqueio ────────────────────────────────────────────────────────────

  async function checkBlocked() {
    if (!state.activePeer || !window.KCAPI || !window.KCAPI.chat) return;
    var r = await window.KCAPI.chat.isBlocked(state.activePeer.id);
    state.blocked = (r && r.data) || { i_blocked: false, they_blocked: false };
    renderBlockBanner();
    updateSendBtnState();
  }

  function renderBlockBanner() {
    var banner = $('kcChatBlockedBanner');
    var text = $('kcChatBlockedText');
    var unblockBtn = $('kcChatUnblockBtn');
    var blockBtn = $('kcChatBlockBtn');
    if (!banner) return;
    if (state.blocked.i_blocked) {
      banner.style.display = 'flex';
      if (text) text.textContent = 'Você bloqueou este usuário. Nenhum dos dois pode enviar mensagens.';
      if (unblockBtn) unblockBtn.style.display = 'inline-flex';
      if (blockBtn) blockBtn.innerHTML = '<i class="fas fa-check"></i>';
    } else if (state.blocked.they_blocked) {
      banner.style.display = 'flex';
      if (text) text.textContent = 'Você não pode enviar mensagens neste momento.';
      if (unblockBtn) unblockBtn.style.display = 'none';
      if (blockBtn) blockBtn.innerHTML = '<i class="fas fa-ban"></i>';
    } else {
      banner.style.display = 'none';
      if (blockBtn) blockBtn.innerHTML = '<i class="fas fa-ban"></i>';
    }
  }

  async function handleBlock() {
    if (!state.activePeer) return;
    if (state.blocked.i_blocked) {
      // Já bloqueado → não faz nada (botão vira unblock no banner)
      return;
    }
    if (!confirm('Bloquear ' + (state.activePeer.display_name || 'este usuário') + '? Nenhum dos dois poderá enviar mensagens nesta conversa.')) return;
    var r = await window.KCAPI.chat.blockUser(state.activePeer.id);
    if (!r || !r.ok) {
      toast((r && r.error && r.error.message) || 'Erro ao bloquear.', 'error');
      return;
    }
    state.blocked.i_blocked = true;
    renderBlockBanner();
    updateSendBtnState();
    toast('Usuário bloqueado.', 'success');
  }

  async function handleUnblock() {
    if (!state.activePeer) return;
    var r = await window.KCAPI.chat.unblockUser(state.activePeer.id);
    if (!r || !r.ok) {
      toast((r && r.error && r.error.message) || 'Erro ao desbloquear.', 'error');
      return;
    }
    state.blocked.i_blocked = false;
    renderBlockBanner();
    updateSendBtnState();
    toast('Usuário desbloqueado.', 'success');
  }

  // ── Delete / Edit / Report ──────────────────────────────────────────────

  async function handleDeleteMessage(msgId) {
    if (!msgId) return;
    if (!confirm('Apagar esta mensagem? A imagem (se houver) será removida do servidor.')) return;
    var r = await window.KCAPI.chat.deleteMessage(msgId);
    if (!r || !r.ok) {
      toast((r && r.error && r.error.message) || 'Erro ao apagar.', 'error');
      return;
    }
    var m = state.messagesById.get(msgId);
    if (m) {
      m.deleted_at = new Date().toISOString();
      m.content = null;
      m.media_path = null;
    }
    renderMessagesList();
  }

  async function handleEditMessage(msgId) {
    if (!msgId) return;
    var m = state.messagesById.get(msgId);
    if (!m || m.message_type !== 'text') return;
    var newContent = prompt('Editar mensagem:', m.content || '');
    if (newContent == null) return;
    newContent = String(newContent).trim();
    if (newContent === '' || newContent === m.content) return;
    var r = await window.KCAPI.chat.editMessage(msgId, newContent);
    if (!r || !r.ok) {
      var msg = (r && r.error && r.error.message) || 'Erro ao editar.';
      if (msg.indexOf('edit_window_expired') >= 0) msg = 'Só dá para editar mensagens das últimas 24 horas.';
      toast(msg, 'error');
      return;
    }
    m.content = newContent;
    m.edited_at = new Date().toISOString();
    renderMessagesList();
  }

  async function handleReportMessage(msgId) {
    if (!msgId) return;
    var reason = prompt('Motivo da denúncia (spam, harassment, hate, inappropriate, scam, illegal, offensive, misleading, privacy, other):');
    if (!reason) return;
    var details = prompt('Detalhes opcionais (deixe em branco se não tiver):') || null;
    var r = await window.KCAPI.chat.reportMessage(msgId, reason.toLowerCase().trim(), details);
    if (!r || !r.ok) {
      toast((r && r.error && r.error.message) || 'Erro ao denunciar.', 'error');
      return;
    }
    toast('Denúncia registrada. Obrigado!', 'success');
  }

  // ── Realtime ────────────────────────────────────────────────────────────

  function handleRealtime(payload) {
    if (!payload) return;
    var eventType = String(payload.eventType || 'INSERT').toUpperCase();

    if (eventType === 'INSERT' && payload.new && payload.new.conversation_id) {
      var msg = payload.new;
      // Só processa se sou participante de alguma conversa minha (RLS já garante)
      if (msg.conversation_id === state.activeConvId) {
        var shouldScroll = (state.me && msg.sender_id === state.me.id) || isNearBottom();
        appendMessage(msg, { scroll: shouldScroll });
        if (state.me && msg.sender_id !== state.me.id) {
          if (shouldScroll) {
            markActiveConversationRead(msg.message_id || msg.id);
          } else {
            state.pendingActiveUnread += 1;
            setJumpVisible(true);
          }
        }
      }
      scheduleLoadConversations();
    } else if (eventType === 'UPDATE' && payload.new) {
      // Mensagem editada ou deletada
      var m = state.messagesById.get(payload.new.id);
      if (m) {
        m.content = payload.new.content;
        m.edited_at = payload.new.edited_at;
        m.deleted_at = payload.new.deleted_at;
        m.media_path = payload.new.media_path;
        renderMessagesList();
      }
    } else if (eventType.indexOf('CONVERSATION_') === 0) {
      // Atualização em chat_conversations (last_message_*, etc.)
      scheduleLoadConversations();
    }
  }

  function dispatchUnreadChange() {
    try {
      var total = state.conversations.reduce(function (acc, c) {
        return acc + (Number(c.unread_count) || 0);
      }, 0);
      document.dispatchEvent(new CustomEvent('kc:chat:unread-changed', { detail: { total: total } }));
    } catch (_) {}
  }

  function scheduleAuthRestart(user) {
    if (state.authRestartTimer) clearTimeout(state.authRestartTimer);
    state.authRestartTimer = setTimeout(function () {
      state.authRestartTimer = null;
      var hadActiveUser = !!(state.me && state.me.id);
      cleanup();
      if (hadActiveUser) resetSessionState();
      startForUser(user).catch(function (err) {
        console.warn('[chat] restart auth falhou:', err && err.message || err);
        renderEmptyList('error');
      });
    }, 80);
  }

  function handleAuthChange(event) {
    var detail = event && event.detail ? event.detail : {};
    var eventName = String(detail.event || '').toUpperCase();
    var nextUser = normalizeAuthUser(detail.user);
    var currentId = state.me && state.me.id ? String(state.me.id) : '';

    if (eventName === 'SIGNED_OUT') {
      if (state.authRestartTimer) {
        clearTimeout(state.authRestartTimer);
        state.authRestartTimer = null;
      }
      cleanup();
      resetSessionState();
      renderEmptyList('login_required');
      return;
    }

    if (!nextUser || !nextUser.id) return;

    if (currentId && currentId === String(nextUser.id)) {
      state.me.email = nextUser.email || state.me.email || '';
      return;
    }

    scheduleAuthRestart(nextUser);
  }

  // ── Eventos ─────────────────────────────────────────────────────────────

  function bindEvents() {
    if (state.eventsBound) return;
    state.eventsBound = true;

    var form = $('kcChatComposer');
    var input = $('kcChatInput');
    var attachBtn = $('kcChatAttachBtn');
    var fileInput = $('kcChatFileInput');
    var backBtn = $('kcChatBackBtn');
    var profileBtn = $('kcChatViewProfileBtn');
    var blockBtn = $('kcChatBlockBtn');
    var unblockBtn = $('kcChatUnblockBtn');
    var messages = $('kcChatMessages');
    var searchInput = $('kcChatConversationSearch');
    var jumpBtn = $('kcChatJumpBtn');

    if (form) form.addEventListener('submit', handleSubmit);

    if (input) {
      input.addEventListener('input', function () {
        autoGrow();
        updateSendBtnState();
        saveDraft(state.activeConvId);
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSubmit();
        }
      });
    }

    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        state.pendingFile = file;
        fileInput.value = '';
        renderComposerPreview();
        updateSendBtnState();
        if (input) input.focus();
      });
    }

    if (backBtn) {
      backBtn.addEventListener('click', function () {
        saveDraft(state.activeConvId);
        state.activeConvId = null;
        state.activePeer = null;
        state.pendingActiveUnread = 0;
        setJumpVisible(false);
        setHash('');
        setActivePane('list');
        var empty = $('kcChatEmptyPanel');
        var active = $('kcChatActiveConv');
        if (empty) empty.style.display = 'flex';
        if (active) active.style.display = 'none';
        renderConversationsList();
      });
    }

    if (profileBtn) {
      profileBtn.addEventListener('click', function () {
        if (state.activePeer && state.activePeer.id) {
          window.location.href = 'profile.html?id=' + encodeURIComponent(state.activePeer.id);
        }
      });
    }

    if (blockBtn) blockBtn.addEventListener('click', handleBlock);
    if (unblockBtn) unblockBtn.addEventListener('click', handleUnblock);

    if (messages) {
      // Paginação ao scrollar pro topo
      messages.addEventListener('scroll', function () {
        if (messages.scrollTop < 80 && state.hasMoreMessages && !state.isLoadingMore) {
          loadMoreMessages();
        }
        if (state.pendingActiveUnread > 0 && isNearBottom()) {
          var last = state.messages[state.messages.length - 1];
          markActiveConversationRead(last && last.message_id);
        }
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        state.conversationQuery = String(searchInput.value || '');
        renderConversationsList();
      });
    }

    if (jumpBtn) {
      jumpBtn.addEventListener('click', function () {
        scrollToBottom();
        var last = state.messages[state.messages.length - 1];
        markActiveConversationRead(last && last.message_id);
      });
    }

    // Reage a auth changes sem recarregar a pagina em refresh de token.
    document.addEventListener('kc:authchange', handleAuthChange);
  }

  // ── Bootstrap ───────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // Expõe versão para debug
  window.KCChatInbox = Object.freeze({ VERSION: VERSION });
})();
