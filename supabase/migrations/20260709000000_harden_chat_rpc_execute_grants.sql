-- V76.60 - Reaplica grants minimos para RPCs de chat.
--
-- Motivo: CREATE OR REPLACE/DROP+CREATE de wrappers posteriores restaurou o
-- EXECUTE implicito de PUBLIC em algumas funcoes. A checagem interna de
-- auth.uid() evitava mutacao anonima, mas o endpoint ainda era invocavel.
--
-- Esta migration e segura para db reset local. Nao executar db push contra o
-- projeto remoto ate a reconciliacao documentada do historico de migrations.

begin;

-- Implementacoes privadas SECURITY DEFINER: apenas chamadas autenticadas por
-- wrappers SECURITY INVOKER devem alcanca-las.
revoke all on function kc_private.kc_chat_list_messages(uuid, integer, timestamp with time zone)
  from public, anon, authenticated;
grant execute on function kc_private.kc_chat_list_messages(uuid, integer, timestamp with time zone)
  to authenticated;

revoke all on function kc_private.kc_chat_set_message_reply(uuid, uuid)
  from public, anon, authenticated;
grant execute on function kc_private.kc_chat_set_message_reply(uuid, uuid)
  to authenticated;

revoke all on function kc_private.kc_chat_toggle_reaction(uuid, text)
  from public, anon, authenticated;
grant execute on function kc_private.kc_chat_toggle_reaction(uuid, text)
  to authenticated;

-- Wrappers publicos: expor apenas a usuarios autenticados. O revoke explicito
-- de PUBLIC impede que um DROP+CREATE futuro reintroduza acesso anonimo.
revoke all on function public.kc_chat_list_messages(uuid, integer, timestamp with time zone)
  from public, anon, authenticated;
grant execute on function public.kc_chat_list_messages(uuid, integer, timestamp with time zone)
  to authenticated;

revoke all on function public.kc_chat_set_message_reply(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.kc_chat_set_message_reply(uuid, uuid)
  to authenticated;

revoke all on function public.kc_chat_toggle_reaction(uuid, text)
  from public, anon, authenticated;
grant execute on function public.kc_chat_toggle_reaction(uuid, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
