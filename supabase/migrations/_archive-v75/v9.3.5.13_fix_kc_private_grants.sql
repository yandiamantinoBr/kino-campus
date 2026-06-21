-- v9.3.5.13 - Corrige grants quebrados em v9.3.5.9 + estende para chat (v9.3.5.10-12)
--
-- BUG: A migration v9.3.5.9 revogou EXECUTE de `authenticated` nas funcoes em
-- kc_private (workers SECURITY DEFINER). Como o wrapper public.* roda em
-- SECURITY INVOKER, o caller (authenticated) precisa ter EXECUTE no worker
-- privado para a chamada propagar. Sem o grant, retorna 42501 (permission
-- denied for function ...).
--
-- Pattern correto (ver kc_admin_search_posts_full pre-existente):
--   * public.foo (INVOKER) tem grant para anon/authenticated
--   * kc_private.foo (DEFINER) TAMBEM tem grant para anon/authenticated
--   * O linter so inspeciona public.* SECURITY DEFINER, entao grants em
--     kc_private nao acionam warning de "anon_security_definer_function_executable".
--
-- Smoke test E2E (em transacao com rollback):
--   9/9 passos passaram: start_conversation, send_message, list_conv,
--   unread_count, list_messages, block_user, send_blocked (negado), unblock_user,
--   send_after_unblock.

-- ── v9.3.5.9 workers ────────────────────────────────────────────────────────
grant execute on function kc_private.kc_create_help_request(jsonb) to anon, authenticated;
grant execute on function kc_private.kc_get_personalized_tabs(text, integer) to anon, authenticated;
grant execute on function kc_private.kc_admin_decide_external_access(uuid, text, text) to authenticated;
grant execute on function kc_private.kc_admin_list_external_access(text, integer, integer) to authenticated;

-- ── v9.3.5.10 workers (chat read/write base) ────────────────────────────────
grant execute on function kc_private.kc_chat_start_conversation(uuid) to authenticated;
grant execute on function kc_private.kc_chat_send_message(uuid, text, text, text) to authenticated;
grant execute on function kc_private.kc_chat_list_conversations(int, timestamptz) to authenticated;
grant execute on function kc_private.kc_chat_list_messages(uuid, int, timestamptz) to authenticated;
grant execute on function kc_private.kc_chat_mark_read(uuid, uuid) to authenticated;
grant execute on function kc_private.kc_chat_unread_total() to authenticated;
grant execute on function kc_private.kc_chat_delete_message(uuid) to authenticated;
grant execute on function kc_private.kc_chat_edit_message(uuid, text) to authenticated;

-- Helpers internos (chamados de outros workers, precisam de grant para refletir)
grant execute on function kc_private.kc_chat_other_participant(public.chat_conversations, uuid) to authenticated;
grant execute on function kc_private.kc_chat_is_new_user(uuid) to authenticated;

-- ── v9.3.5.12 workers (blocks + report) ─────────────────────────────────────
grant execute on function kc_private.kc_chat_block_user(uuid, text) to authenticated;
grant execute on function kc_private.kc_chat_unblock_user(uuid) to authenticated;
grant execute on function kc_private.kc_chat_is_blocked(uuid) to authenticated;
grant execute on function kc_private.kc_chat_report_message(uuid, text, text) to authenticated;
