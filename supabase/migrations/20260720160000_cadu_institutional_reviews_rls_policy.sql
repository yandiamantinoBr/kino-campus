-- 20260720160000_cadu_institutional_reviews_rls_policy.sql
-- Fix Supabase Security Advisor: rls_enabled_no_policy on
-- public.cadu_institutional_source_reviews
--
-- Context:
-- The table was created with RLS ON and ALL privileges revoked, with mutations
-- only via SECURITY DEFINER RPCs (service_role). That is fail-closed, but the
-- advisor flags "RLS enabled, no policy" as INFO.
--
-- Resolution (aligned with kc_trusted_publishers / other admin catalogs):
-- - Add admin-only SELECT policy for authenticated admins
-- - Keep mutations RPC-only (no INSERT/UPDATE/DELETE policies for clients)
-- - Grant SELECT to authenticated so admin JWT can inspect; anon stays revoked

begin;

alter table public.cadu_institutional_source_reviews enable row level security;

drop policy if exists cadu_institutional_source_reviews_admin_select
  on public.cadu_institutional_source_reviews;

create policy cadu_institutional_source_reviews_admin_select
  on public.cadu_institutional_source_reviews
  for select
  to authenticated
  using (public.kc_is_admin((select auth.uid())));

-- Fail-closed for non-admins: no write policies for authenticated/anon.
-- Direct client writes remain denied even if grants are broadened later.

revoke all on table public.cadu_institutional_source_reviews
  from public, anon, authenticated, service_role;

grant select on table public.cadu_institutional_source_reviews
  to authenticated;

-- service_role is used by edge/admin proxy + SECURITY DEFINER RPCs.
-- SELECT helps diagnostics; writes still go through owned RPCs as table owner.
grant select on table public.cadu_institutional_source_reviews
  to service_role;

comment on table public.cadu_institutional_source_reviews is
  'Fila editorial tipada do Mapa UFG. Nunca é publicação do feed. SELECT apenas para admins (RLS). Mutations via RPCs SECURITY DEFINER (service_role).';

commit;
