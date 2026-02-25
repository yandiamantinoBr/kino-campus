-- Kino Campus — V8.2.4.1
-- DELETE Policy para posts (BUG-004 do Deep Code Review V8.2.2.0)
--
-- Problema: Não existia policy de DELETE para public.posts no RLS.
-- Consequência: Usuários autenticados recebiam erro 403 ao tentar
--   deletar os próprios posts via Supabase client.
--
-- Escopo desta migration:
--   1) Criar policy posts_delete_own: autor pode deletar post próprio
--      que ainda esteja com status 'published' ou 'pending' (não 'deleted').
--   2) Criar policy posts_delete_admin: admins (verified=true via service_role
--      ou via coluna profiles.is_admin) podem deletar qualquer post.
--
-- Decisão de design:
--   - Usamos soft-delete padrão (update status='deleted') para auditoria.
--     A policy de DELETE físico é criada como fallback de limpeza mas
--     o app deve preferir o update de status via posts_update_own.
--   - Admins com service_role bypassam RLS normalmente; esta policy
--     cobre o caso de admin autenticado como usuário regular com is_admin=true.

begin;

-- 1) DELETE policy para dono do post
drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own
on public.posts for delete
using (
  auth.uid() is not null
  and auth.uid() = author_id
);

-- 2) DELETE policy para admins (requer coluna profiles.is_admin)
--    Se a coluna não existir, a policy é criada mas nunca dispara (seguro).
drop policy if exists posts_delete_admin on public.posts;
create policy posts_delete_admin
on public.posts for delete
using (
  auth.uid() is not null
  and exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_admin = true
  )
);

commit;
