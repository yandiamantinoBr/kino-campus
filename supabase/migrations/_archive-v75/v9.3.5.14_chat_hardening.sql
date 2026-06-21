-- v9.3.5.14 - Hardening das RPCs de Mensagens
-- Objetivo:
-- - Remover EXECUTE herdado por PUBLIC/anon nas wrappers public.kc_chat_*.
-- - Manter apenas authenticated nas wrappers usadas pelo frontend.
-- - Bloquear execucao direta de funcoes de trigger em kc_private.

-- Wrappers publicas expostas via /rest/v1/rpc: somente usuarios autenticados.
revoke all on function public.kc_chat_start_conversation(uuid) from public, anon, authenticated;
revoke all on function public.kc_chat_send_message(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.kc_chat_list_conversations(integer, timestamptz) from public, anon, authenticated;
revoke all on function public.kc_chat_list_messages(uuid, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.kc_chat_mark_read(uuid, uuid) from public, anon, authenticated;
revoke all on function public.kc_chat_unread_total() from public, anon, authenticated;
revoke all on function public.kc_chat_delete_message(uuid) from public, anon, authenticated;
revoke all on function public.kc_chat_edit_message(uuid, text) from public, anon, authenticated;
revoke all on function public.kc_chat_block_user(uuid, text) from public, anon, authenticated;
revoke all on function public.kc_chat_unblock_user(uuid) from public, anon, authenticated;
revoke all on function public.kc_chat_is_blocked(uuid) from public, anon, authenticated;
revoke all on function public.kc_chat_report_message(uuid, text, text) from public, anon, authenticated;

grant execute on function public.kc_chat_start_conversation(uuid) to authenticated;
grant execute on function public.kc_chat_send_message(uuid, text, text, text) to authenticated;
grant execute on function public.kc_chat_list_conversations(integer, timestamptz) to authenticated;
grant execute on function public.kc_chat_list_messages(uuid, integer, timestamptz) to authenticated;
grant execute on function public.kc_chat_mark_read(uuid, uuid) to authenticated;
grant execute on function public.kc_chat_unread_total() to authenticated;
grant execute on function public.kc_chat_delete_message(uuid) to authenticated;
grant execute on function public.kc_chat_edit_message(uuid, text) to authenticated;
grant execute on function public.kc_chat_block_user(uuid, text) to authenticated;
grant execute on function public.kc_chat_unblock_user(uuid) to authenticated;
grant execute on function public.kc_chat_is_blocked(uuid) to authenticated;
grant execute on function public.kc_chat_report_message(uuid, text, text) to authenticated;

-- Funcoes acionadas por triggers nao precisam ser executaveis diretamente por roles de API.
revoke all on function kc_private.kc_chat_after_message_insert() from public, anon, authenticated;
revoke all on function kc_private.kc_chat_notify_recipient() from public, anon, authenticated;

comment on function public.kc_chat_start_conversation(uuid) is
  'v9.3.5.14: wrapper de chat executavel apenas por authenticated.';
