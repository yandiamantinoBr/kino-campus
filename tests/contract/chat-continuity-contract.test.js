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
    expect(html).toContain('assets/css/kc-chat.css?v=8.7.4');
    expect(html).toContain('chat-inbox.controller.js?v=9.3.5.28');
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
    expect(controller).toContain('function positionOpenMessageMenu(bubble)');
    expect(controller).toContain('menu.style.left = left + \'px\';');
    expect(controller).toContain('positioned.left - left');
    expect(controller).toContain('if (!isTouchMenuMode()) return;');
    expect(css).toContain('position: fixed;');
    expect(css).toContain('max-width: calc(100vw - 24px);');
  });

  test('chat jump button supports bottom and top navigation for long conversations', () => {
    const controller = read('assets/js/controllers/public/chat-inbox.controller.js');

    expect(controller).toContain('jumpTarget');
    expect(controller).toContain('jumpVisibleUntil');
    expect(controller).toContain('jumpAutoHideTimer');
    expect(controller).toContain('const CHAT_JUMP_IDLE_HIDE_MS = 5500;');
    expect(controller).toContain('CHAT_JUMP_IDLE_HIDE_MS + CHAT_JUMP_IDLE_HIDE_GRACE_MS');
    expect(controller).toContain('const CHAT_JUMP_REVEAL_INTERACTIONS = 2;');
    expect(controller).toContain('const CHAT_JUMP_REVEAL_DISTANCE_PX = 240;');
    expect(controller).toContain('function shouldRevealJumpAfterScroll()');
    expect(controller).toContain('state.jumpScrollInteractions >= CHAT_JUMP_REVEAL_INTERACTIONS');
    expect(controller).toContain('state.jumpScrollDistance >= CHAT_JUMP_REVEAL_DISTANCE_PX');
    expect(controller).toContain('function requestJumpVisibility()');
    expect(controller).toContain('function updateJumpButton()');
    expect(controller).toContain("btn.setAttribute('data-direction', target);");
    expect(controller).toContain("var hasUnread = state.pendingActiveUnread > 0;");
    expect(controller).toContain("var isTemporaryVisible = Date.now() <= state.jumpVisibleUntil;");
    expect(controller).toContain("label.textContent = state.pendingActiveUnread > 0 ? 'Novas mensagens' : (target === 'top' ? 'Topo' : 'Fim');");
    expect(controller).toContain('function scrollToTop()');
    expect(controller).toContain("if (state.jumpTarget === 'top')");
  });

  test('chat emoji picker is vertically scrollable without horizontal overflow', () => {
    const css = read('assets/css/kc-chat.css');

    expect(css).toContain('overflow-y: auto;');
    expect(css).toContain('overflow-x: hidden;');
    expect(css).toContain('grid-template-columns: repeat(auto-fit, minmax(38px, 1fr));');
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

  test('chat reply persistence uses RPC instead of direct table update', () => {
    const supabaseAdapter = read('assets/js/adapters/supabase/supabase.chat.adapter.js');
    const migration = read('supabase/migrations/20260703175720_harden_chat_anon_execute.sql');

    expect(supabaseAdapter).toContain("client.rpc('kc_chat_set_message_reply'");
    expect(supabaseAdapter).not.toContain(".from('chat_messages')\n        .update({ reply_to_id");
    expect(migration).toContain('create or replace function public.kc_chat_set_message_reply');
    expect(migration).toContain('reply_wrong_conversation');
    expect(migration).toContain('grant execute on function public.kc_chat_set_message_reply(uuid, uuid) to authenticated;');
  });

  test('active grant hardening keeps chat RPCs authenticated-only after wrapper recreation', () => {
    const migration = read('supabase/migrations/20260709000000_harden_chat_rpc_execute_grants.sql');
    const functions = [
      'kc_private.kc_chat_list_messages(uuid, integer, timestamp with time zone)',
      'kc_private.kc_chat_set_message_reply(uuid, uuid)',
      'kc_private.kc_chat_toggle_reaction(uuid, text)',
      'public.kc_chat_list_messages(uuid, integer, timestamp with time zone)',
      'public.kc_chat_set_message_reply(uuid, uuid)',
      'public.kc_chat_toggle_reaction(uuid, text)',
    ];

    functions.forEach((functionSignature) => {
      expect(migration).toContain(
        `revoke all on function ${functionSignature}\n  from public, anon, authenticated;`
      );
      expect(migration).toContain(
        `grant execute on function ${functionSignature}\n  to authenticated;`
      );
    });
  });
});
