'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

describe('chat continuity contract', () => {
  test('KCAPI exposes chat before freezing the public facade', () => {
    const source = read('assets/js/api/kc-api.client.js');
    expect(source).toContain('const chat = window._KCAPI.chat || {};');
    expect(source).toContain('window._KCAPI.chat = chat;');
    expect(source).toContain('chat,');
  });

  test('kc-api.chat fills the shared chat facade instead of mutating frozen KCAPI', () => {
    const source = read('assets/js/api/kc-api.chat.js');
    expect(source).toContain('var target = window._KCAPI.chat || {};');
    expect(source).not.toContain('window.KCAPI.chat =');
  });

  test('chat images use signed URLs instead of public storage URLs', () => {
    const controller = read('assets/js/controllers/public/chat-inbox.controller.js');
    const facade = read('assets/js/api/kc-api.chat.js');
    const supabaseAdapter = read('assets/js/adapters/supabase/supabase.chat.adapter.js');

    expect(controller).toContain('getSignedUrl');
    expect(controller).not.toContain('getPublicUrl');
    expect(facade).not.toContain('getPublicUrl');
    expect(supabaseAdapter).not.toContain('getPublicUrl');
  });

  test('chat image failures have retry fallback and upload cleanup', () => {
    const controller = read('assets/js/controllers/public/chat-inbox.controller.js');
    const facade = read('assets/js/api/kc-api.chat.js');
    const supabaseAdapter = read('assets/js/adapters/supabase/supabase.chat.adapter.js');

    expect(controller).toContain('data-media-retry');
    expect(controller).toContain('Imagem indisponível. Tentar novamente');
    expect(controller).toContain('cleanupUploadedChatImage');
    expect(controller).toContain('revokeObjectURL');
    expect(facade).toContain('deleteUploadedMedia');
    expect(supabaseAdapter).toContain('client.storage.from(bucket).remove([path])');
  });

  test('chat inbox keeps drafts, filters conversations and debounces realtime reloads', () => {
    const controller = read('assets/js/controllers/public/chat-inbox.controller.js');
    const html = read('mensagens.html');

    expect(html).toContain('id="kcChatConversationSearch"');
    expect(html).toContain('id="kcChatJumpBtn"');
    expect(controller).toContain('kc:chat:draft:');
    expect(controller).toContain('saveDraft(state.activeConvId)');
    expect(controller).toContain('restoreActiveDraft');
    expect(controller).toContain('conversationQuery');
    expect(controller).toContain('scheduleLoadConversations');
    expect(controller).toContain('loadConversations();');
    expect(controller).not.toContain('state.inboxReloadTimer = setTimeout(function () {\n      state.inboxReloadTimer = null;\n      scheduleLoadConversations();');
    expect(controller).toContain('pendingActiveUnread');
  });

  test('chat migration refreshes preview after edit/delete and hardens media path ownership', () => {
    const migration = read('supabase/migrations/_archive-v75/v9.3.5.15_chat_preview_consistency.sql');

    expect(migration).toContain('kc_chat_refresh_conversation_preview');
    expect(migration).toContain('after update of content, media_path, edited_at, deleted_at');
    expect(migration).toContain("p_media_path !~ v_media_pattern");
    expect(migration).toContain("v_user::text");
  });

  test('mensagens has the short Vercel route rewrite', () => {
    const source = read('vercel.json');
    expect(source).toContain('"source": "/mensagens"');
    expect(source).toContain('"destination": "/mensagens.html"');
  });

  test('mensagens keeps the chat shell wide, stable and cache-busted', () => {
    const html = read('mensagens.html');
    const css = read('assets/css/kc-chat.css');

    expect(html).toContain('body.kc-chat-route .kc-main-content');
    expect(html).toContain('display: block;');
    expect(html).toContain('padding-left: 0 !important;');
    expect(html).toContain('justify-self: center;');
    expect(html).toContain('width: min(1760px, calc(100vw - 56px));');
    expect(html).toContain('assets/css/kc-chat.css?v=8.7.3');
    expect(html).toContain('chat-inbox.controller.js?v=9.3.5.23');
    expect(css).toContain('grid-template-columns: minmax(360px, 33%) minmax(620px, 1fr);');
    expect(css).toContain('height: 100%;');
    expect(css).toContain('border-radius: 22px;');
    expect(css).toContain('overflow-anchor: none;');
  });

  test('chat message menus are hidden by default and only open on hover or touch state', () => {
    const css = read('assets/css/kc-chat.css');
    const controller = read('assets/js/controllers/public/chat-inbox.controller.js');

    expect(css).toContain('opacity: 0;');
    expect(css).toContain('pointer-events: none;');
    expect(css).toContain('@media (hover: hover) and (pointer: fine)');
    expect(css).toContain('@media (hover: none), (pointer: coarse)');
    expect(css).toContain('.kc-chat-msg.is-menu-open .kc-chat-msg__menu');
    expect(controller).toContain('function isTouchMenuMode()');
    expect(controller).toContain('function closeMessageMenus(root)');
    expect(controller).toContain('if (!isTouchMenuMode()) return;');
  });

  test('chat bubbles use a single background token for the received bubble and tail', () => {
    const css = read('assets/css/kc-chat.css');

    expect(css).toContain('--kc-chat-other-bubble: #3a3a3a;');
    expect(css).toContain('--kc-chat-other-bubble: #f3f4f6;');
    expect(css).toContain('background: var(--kc-chat-other-bubble);  /* EXATA cor do bal');
  });

  test('chat conversation deletion is consistent across adapters and hides archived conversations', () => {
    const facade = read('assets/js/api/kc-api.chat.js');
    const localAdapter = read('assets/js/adapters/local/local.chat.adapter.js');
    const supabaseAdapter = read('assets/js/adapters/supabase/supabase.chat.adapter.js');

    expect(facade).toContain('deleteConversation: safe(\'deleteConversation\')');
    expect(localAdapter).toContain('deleteConversation: notSupported');
    expect(localAdapter).toContain('uploadChatMedia: notSupported');
    expect(supabaseAdapter).toContain('options.includeArchived !== true');
    expect(supabaseAdapter).toContain('list = list.filter(function (c) { return !c.archived; });');
  });
});
