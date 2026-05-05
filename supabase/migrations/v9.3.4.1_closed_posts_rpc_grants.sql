-- KinoCampus v9.3.4.1
-- Tighten closed-post RPC grants after the closed status rollout.

begin;

alter function public.kc_can_read_post(uuid, text, text) security invoker;

revoke execute on function public.kc_can_read_post(uuid, text, text) from public;
grant execute on function public.kc_can_read_post(uuid, text, text) to anon, authenticated, service_role;

revoke execute on function public.kc_report_post(uuid, text, text) from public, anon;
grant execute on function public.kc_report_post(uuid, text, text) to authenticated, service_role;

revoke execute on function public.kc_close_post(uuid, text) from public, anon;
grant execute on function public.kc_close_post(uuid, text) to authenticated, service_role;

revoke execute on function public.kc_admin_set_post_status(uuid, text, boolean) from public, anon;
grant execute on function public.kc_admin_set_post_status(uuid, text, boolean) to authenticated, service_role;

commit;
