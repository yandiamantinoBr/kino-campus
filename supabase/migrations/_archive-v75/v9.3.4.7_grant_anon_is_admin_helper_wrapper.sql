begin;

-- Anonymous feed/search helpers reference kc_is_admin inside SQL expressions.
-- The function still returns false for anonymous users, but PostgreSQL requires
-- EXECUTE on referenced functions even when a CASE branch is not taken.
grant usage on schema kc_private to anon;
grant execute on function public.kc_is_admin(uuid) to anon;
grant execute on function kc_private.kc_is_admin(uuid) to anon;

notify pgrst, 'reload schema';

commit;
