-- Kino Campus — V8.1.9.1
-- Admin moderation: permitir SELECT de todos os posts para admins autenticados.

begin;

drop policy if exists posts_select_admin on public.posts;

create policy posts_select_admin
  on public.posts for select
  to authenticated
  using (
    (select is_admin from public.profiles where id = auth.uid()) = true
  );

commit;
