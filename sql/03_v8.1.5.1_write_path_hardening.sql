-- Kino Campus — V8.1.5.1-PATCH
-- Write Path (Create Post) + Storage Hardening (Supabase-first)
--
-- Objetivos:
-- 1) Registrar ordem da galeria no banco (post_media.sort_order)
-- 2) Endurecer Storage (bucket kino-media) para uploads em path controlado:
--    post-media/{userId}/{postId}/{filename}

alter table public.post_media
  add column if not exists sort_order integer not null default 0;

create index if not exists post_media_post_id_sort_order_idx
  on public.post_media (post_id, sort_order);

-- NOTA: storage.objects já tem RLS ativado por padrão no Supabase.
-- Não é necessário (nem permitido) fazer ALTER TABLE aqui.

drop policy if exists storage_kino_media_auth_write on storage.objects;
create policy storage_kino_media_auth_write
on storage.objects for insert
with check (
  bucket_id = 'kino-media'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = 'post-media'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1
    from public.posts p
    where p.author_id = auth.uid()
      and p.id = (
        case
          when (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ((storage.foldername(name))[3])::uuid
          else null
        end
      )
  )
);

drop policy if exists storage_kino_media_owner_update on storage.objects;
create policy storage_kino_media_owner_update
on storage.objects for update
using (
  bucket_id = 'kino-media'
  and auth.uid() = owner
  and (storage.foldername(name))[1] = 'post-media'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1
    from public.posts p
    where p.author_id = auth.uid()
      and p.id = (
        case
          when (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ((storage.foldername(name))[3])::uuid
          else null
        end
      )
  )
)
with check (
  bucket_id = 'kino-media'
  and auth.uid() = owner
  and (storage.foldername(name))[1] = 'post-media'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1
    from public.posts p
    where p.author_id = auth.uid()
      and p.id = (
        case
          when (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ((storage.foldername(name))[3])::uuid
          else null
        end
      )
  )
);

drop policy if exists storage_kino_media_owner_delete on storage.objects;
create policy storage_kino_media_owner_delete
on storage.objects for delete
using (
  bucket_id = 'kino-media'
  and auth.uid() = owner
  and (storage.foldername(name))[1] = 'post-media'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1
    from public.posts p
    where p.author_id = auth.uid()
      and p.id = (
        case
          when (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ((storage.foldername(name))[3])::uuid
          else null
        end
      )
  )
);
