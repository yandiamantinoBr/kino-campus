-- Kino Campus — V8.1.7.4
-- Admin Role + Storage MIME Validation
--
-- Escopo:
--   1) Coluna is_admin em public.profiles (default false)
--   2) Policy reports_select_admins: admins autenticados podem ler reports
--   3) Policy comments_delete_admin: admins podem deletar qualquer comentário
--   4) Policy posts_update_status_admin: admins podem atualizar status de posts
--   5) Storage: validar extensão de arquivo (MIME por extensão) no upload

begin;

-- 1) Coluna is_admin em profiles (idempotente)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_admin'
  ) then
    alter table public.profiles add column is_admin boolean not null default false;
  end if;
end $$;

-- 2) Reports: policy de SELECT para admins (substitui a que só tinha service_role)
--    Preserva o isolamento: anon não pode ler, authenticated normal não pode ler.
drop policy if exists reports_select_service_role on public.reports;
drop policy if exists reports_select_admins       on public.reports;

create policy reports_select_admins
  on public.reports for select
  using (
    (select is_admin from public.profiles where id = auth.uid()) = true
  );

-- Continua permitindo que service_role use a tabela sem policy (bypassa RLS por padrão)

-- 3) Reports: admins podem fechar denúncias (atualizar status)
drop policy if exists reports_update_admin on public.reports;

create policy reports_update_admin
  on public.reports for update
  to authenticated
  using (
    (select is_admin from public.profiles where id = auth.uid()) = true
  )
  with check (
    (select is_admin from public.profiles where id = auth.uid()) = true
  );

-- Extender privilege de UPDATE para authenticated (somente admins passam pelo RLS)
grant update (status) on table public.reports to authenticated;

-- 4) Comments: admins podem deletar qualquer comentário (moderação)
drop policy if exists comments_delete_admin on public.comments;

create policy comments_delete_admin
  on public.comments for delete
  to authenticated
  using (
    (select is_admin from public.profiles where id = auth.uid()) = true
  );

-- 5) Posts: admins podem atualizar status de qualquer post (moderar conteúdo)
drop policy if exists posts_update_status_admin on public.posts;

create policy posts_update_status_admin
  on public.posts for update
  to authenticated
  using (
    (select is_admin from public.profiles where id = auth.uid()) = true
  )
  with check (
    (select is_admin from public.profiles where id = auth.uid()) = true
  );

grant update (status) on table public.posts to authenticated;

-- 6) Storage: validar extensão de arquivo no upload (defesa em profundidade)
--    Complementa a validação de path já existente (v8.1.5.1).
--    Extensões permitidas: jpg, jpeg, png, gif, webp.
--    Limite de tamanho: 10MB por arquivo.
drop policy if exists storage_kino_media_mime_check on storage.objects;

create policy storage_kino_media_mime_check
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kino-media'
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'gif', 'webp')
    and octet_length(name) < 512
  );

-- Nota: o limite de tamanho de conteúdo (10MB) deve ser configurado no Supabase
-- Dashboard > Storage > Bucket kino-media > Max file size: 10MB
-- A policy SQL não tem acesso direto ao tamanho do conteúdo do arquivo.

commit;
