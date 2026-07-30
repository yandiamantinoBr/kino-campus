\set ON_ERROR_STOP on

-- Sanitized six-column fingerprint observed in the linked project on
-- 2026-07-13. This fixture intentionally restores only the metadata objects
-- required to prove the pending Phase-A migrations as a real upgrade path.
begin;

drop function if exists public.kc_cadu_metadata_contract();
drop function if exists public.kc_cadu_upsert_source_override(
  text, integer, text, boolean, bigint, jsonb
);
drop function if exists public.kc_cadu_upsert_legacy_override(
  text, text, integer, text, boolean, bigint
);

drop trigger if exists kc_unit_meta_touch on public.kc_unit_meta;
alter table public.kc_unit_meta
  drop constraint if exists kc_unit_meta_revision_positive;
alter table public.kc_unit_meta
  drop column if exists revision;
drop index if exists public.idx_kc_unit_meta_updated_by;

create or replace function public.kc_unit_meta_touch()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger kc_unit_meta_touch
  before update on public.kc_unit_meta
  for each row execute function public.kc_unit_meta_touch();

-- Phase-A test compatibility (issue #748): the pre-privacy schema did not
-- include the active-session write guard trigger nor the active-session
-- restrictive policy. The reset by supabase db reset applies the privacy
-- migrations first, so we have to drop the privacy artifacts here for the
-- legacy migration to be exercised as a fresh upgrade path.
drop trigger if exists kc_active_session_write_guard on public.kc_unit_meta;
drop policy if exists kc_active_session_restrictive on public.kc_unit_meta;

-- Reset the FK to the pre-privacy state (no ON DELETE SET NULL).
alter table public.kc_unit_meta
  drop constraint if exists kc_unit_meta_updated_by_fkey;
alter table public.kc_unit_meta
  add constraint kc_unit_meta_updated_by_fkey
  foreign key (updated_by) references auth.users(id);

drop policy if exists kc_unit_meta_select_public on public.kc_unit_meta;
drop policy if exists kc_unit_meta_insert_admin on public.kc_unit_meta;
drop policy if exists kc_unit_meta_update_admin on public.kc_unit_meta;
drop policy if exists kc_unit_meta_delete_admin on public.kc_unit_meta;
drop policy if exists "anyone can read kc_unit_meta" on public.kc_unit_meta;
drop policy if exists "admins can insert kc_unit_meta" on public.kc_unit_meta;
drop policy if exists "admins can update kc_unit_meta" on public.kc_unit_meta;
drop policy if exists "admins can delete kc_unit_meta" on public.kc_unit_meta;

-- Pre-privacy schema had a single permissive SELECT policy plus an
-- all-browsers-allowed grant. The four admin policies that came in via
-- the linked-project fingerprint existed alongside, but the 20260713183000
-- migration drops them and the probe expects only the single permissive
-- SELECT. We pre-empt that work here so the test exercises the migration
-- against a fully pre-privacy state.
create policy "anyone can read kc_unit_meta"
  on public.kc_unit_meta for select using (true);

revoke all on table public.kc_unit_meta
  from public, anon, authenticated, service_role;
grant all on table public.kc_unit_meta to anon, authenticated, service_role;
grant maintain on table public.kc_unit_meta to anon, authenticated, service_role;
grant execute on function public.kc_unit_meta_touch()
  to public, anon, authenticated, service_role;

delete from public.kc_unit_meta where unit_id = 'legacy-upgrade-fixture';
insert into public.kc_unit_meta (unit_id, tier, note, updated_at, source)
values (
  'legacy-upgrade-fixture',
  2,
  'preserve me',
  '2026-07-13T12:00:00Z'::timestamptz,
  'legacy-admin-ui'
);

commit;
