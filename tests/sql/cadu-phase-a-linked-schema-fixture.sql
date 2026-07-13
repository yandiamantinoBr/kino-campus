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

drop policy if exists kc_unit_meta_select_public on public.kc_unit_meta;
drop policy if exists kc_unit_meta_insert_admin on public.kc_unit_meta;
drop policy if exists kc_unit_meta_update_admin on public.kc_unit_meta;
drop policy if exists kc_unit_meta_delete_admin on public.kc_unit_meta;
drop policy if exists "anyone can read kc_unit_meta" on public.kc_unit_meta;
drop policy if exists "admins can insert kc_unit_meta" on public.kc_unit_meta;
drop policy if exists "admins can update kc_unit_meta" on public.kc_unit_meta;
drop policy if exists "admins can delete kc_unit_meta" on public.kc_unit_meta;

create policy "anyone can read kc_unit_meta"
  on public.kc_unit_meta for select using (true);
create policy "admins can insert kc_unit_meta"
  on public.kc_unit_meta for insert
  with check (public.kc_is_admin((select auth.uid())));
create policy "admins can update kc_unit_meta"
  on public.kc_unit_meta for update
  using (public.kc_is_admin((select auth.uid())))
  with check (public.kc_is_admin((select auth.uid())));
create policy "admins can delete kc_unit_meta"
  on public.kc_unit_meta for delete
  using (public.kc_is_admin((select auth.uid())));

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
