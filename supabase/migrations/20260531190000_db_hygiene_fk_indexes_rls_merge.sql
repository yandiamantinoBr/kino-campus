-- KinoCampus 2026-05-31
-- Faxina de banco (baixo risco) — advisors de performance do Supabase:
--   1) Índices de cobertura para chaves estrangeiras sem índice (additivo).
--   2) Consolidação de políticas RLS permissivas múltiplas (mesma união de acesso),
--      removendo redundâncias e fundindo pares admin/own — sem mudar a semântica.
--
-- Tudo reversível. Nenhuma mudança no site público (post_media_select_public
-- permanece; o acesso de leitura público continua igual).

begin;

-- ── 1) Índices de cobertura de FKs ──
create index if not exists account_erasure_requests_processed_by_idx
  on public.account_erasure_requests (processed_by);
create index if not exists chat_conversations_last_message_sender_idx
  on public.chat_conversations (last_message_sender);
create index if not exists chat_read_state_last_read_msg_id_idx
  on public.chat_read_state (last_read_msg_id);
create index if not exists chat_read_state_user_id_idx
  on public.chat_read_state (user_id);
create index if not exists help_requests_admin_decided_by_idx
  on public.help_requests (admin_decided_by);
create index if not exists kc_trusted_publishers_created_by_idx
  on public.kc_trusted_publishers (created_by);
create index if not exists post_flood_limits_created_by_idx
  on public.post_flood_limits (created_by);
create index if not exists post_flood_resets_created_by_idx
  on public.post_flood_resets (created_by);

-- ── 2a) Redundâncias: drop de políticas já cobertas por uma FOR ALL idêntica ──
-- kc_trusted_publishers_admin_write é FOR ALL com kc_is_admin → cobre SELECT.
drop policy if exists kc_trusted_publishers_admin_select on public.kc_trusted_publishers;
-- user_blocks_modify_own é FOR ALL com blocker_id = auth.uid() → cobre SELECT.
drop policy if exists user_blocks_select_own on public.user_blocks;

-- ── 2b) post_media: fundir os pares (admin OR dono) em uma policy por ação ──
drop policy if exists post_media_delete_admin on public.post_media;
drop policy if exists post_media_delete_own on public.post_media;
create policy post_media_delete on public.post_media
  for delete to authenticated
  using (
    kc_is_admin((select auth.uid()))
    or exists (select 1 from public.posts p where p.id = post_media.post_id and p.author_id = (select auth.uid()))
  );

drop policy if exists post_media_insert_admin on public.post_media;
drop policy if exists post_media_insert_own on public.post_media;
create policy post_media_insert on public.post_media
  for insert to authenticated
  with check (
    kc_is_admin((select auth.uid()))
    or exists (select 1 from public.posts p where p.id = post_media.post_id and p.author_id = (select auth.uid()))
  );

drop policy if exists post_media_update_admin on public.post_media;
drop policy if exists post_media_update_own on public.post_media;
create policy post_media_update on public.post_media
  for update to authenticated
  using (
    kc_is_admin((select auth.uid()))
    or exists (select 1 from public.posts p where p.id = post_media.post_id and p.author_id = (select auth.uid()))
  )
  with check (
    kc_is_admin((select auth.uid()))
    or exists (select 1 from public.posts p where p.id = post_media.post_id and p.author_id = (select auth.uid()))
  );

commit;
