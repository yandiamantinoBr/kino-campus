-- Keep anonymous post-view calls deterministic without widening any data access.
--
-- kc_track_view is intentionally authenticated-only. The private SECURITY
-- DEFINER implementation returns {ok:false,code:'AUTH_REQUIRED'} before it
-- reads or writes application data when auth.uid() is null. Granting only the
-- public wrapper to anon lets stale clients and crawlers receive that safe
-- response instead of a noisy 401/42501 at the PostgREST boundary. The
-- authenticated grant remains unchanged and no table privileges are added.

grant execute on function public.kc_track_view(uuid) to anon;
