-- Run this in the Supabase SQL Editor as a project owner/admin if
-- v8.3.4.1_saved_posts_multi_profile_bio_avatar.sql prints the notice about
-- skipping storage.objects avatar policies.

drop policy if exists storage_kino_media_profile_avatar_insert on storage.objects;
create policy storage_kino_media_profile_avatar_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'kino-media'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = 'profile-avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists storage_kino_media_profile_avatar_update on storage.objects;
create policy storage_kino_media_profile_avatar_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'kino-media'
  and auth.uid() = owner
  and (storage.foldername(name))[1] = 'profile-avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'kino-media'
  and auth.uid() = owner
  and (storage.foldername(name))[1] = 'profile-avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists storage_kino_media_profile_avatar_delete on storage.objects;
create policy storage_kino_media_profile_avatar_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'kino-media'
  and auth.uid() = owner
  and (storage.foldername(name))[1] = 'profile-avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
);
