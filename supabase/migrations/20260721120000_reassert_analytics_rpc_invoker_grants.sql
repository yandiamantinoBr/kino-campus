-- ============================================================================
-- 20260721120000_reassert_analytics_rpc_invoker_grants.sql
--
-- Reafirma o padrão public SECURITY INVOKER + grants mínimos para as RPCs
-- de analytics/privacidade/busca. O Security Advisor do Supabase às vezes
-- cacheia avisos antigos quando as funções públicas já não são DEFINER.
--
-- Não altera a lógica de negócio; apenas força:
-- - wrappers public com SECURITY INVOKER
-- - REVOKE ALL de PUBLIC (e de roles que não precisam)
-- - GRANT EXECUTE só para anon/authenticated conforme o desenho
-- - kc_private DEFINER sem EXECUTE para anon/authenticated
-- ============================================================================

do $$
begin
  -- public.kc_ingest_search_queries
  if to_regprocedure('public.kc_ingest_search_queries(text,jsonb)') is not null then
    execute 'alter function public.kc_ingest_search_queries(text, jsonb) security invoker';
    revoke all on function public.kc_ingest_search_queries(text, jsonb) from public;
    grant execute on function public.kc_ingest_search_queries(text, jsonb) to anon, authenticated;
  end if;

  -- public.kc_track_privacy_event
  if to_regprocedure('public.kc_track_privacy_event(text,text,text,text,text,text,jsonb)') is not null then
    execute 'alter function public.kc_track_privacy_event(text, text, text, text, text, text, jsonb) security invoker';
    revoke all on function public.kc_track_privacy_event(text, text, text, text, text, text, jsonb) from public;
    grant execute on function public.kc_track_privacy_event(text, text, text, text, text, text, jsonb) to anon, authenticated;
  end if;

  -- public.kc_admin_search_trends*
  if to_regprocedure('public.kc_admin_search_trends(integer,timestamp with time zone)') is not null then
    execute 'alter function public.kc_admin_search_trends(integer, timestamptz) security invoker';
    revoke all on function public.kc_admin_search_trends(integer, timestamptz) from public, anon;
    grant execute on function public.kc_admin_search_trends(integer, timestamptz) to authenticated;
  end if;

  if to_regprocedure('public.kc_admin_search_trends_classified(integer,timestamp with time zone)') is not null then
    execute 'alter function public.kc_admin_search_trends_classified(integer, timestamptz) security invoker';
    revoke all on function public.kc_admin_search_trends_classified(integer, timestamptz) from public, anon;
    grant execute on function public.kc_admin_search_trends_classified(integer, timestamptz) to authenticated;
  end if;

  -- kc_private implementations stay DEFINER but must not be callable via PostgREST roles.
  if to_regprocedure('kc_private.kc_admin_search_trends(integer,timestamp with time zone)') is not null then
    revoke all on function kc_private.kc_admin_search_trends(integer, timestamptz) from public, anon, authenticated;
  end if;
  if to_regprocedure('kc_private.kc_admin_search_trends_classified(integer,timestamp with time zone)') is not null then
    revoke all on function kc_private.kc_admin_search_trends_classified(integer, timestamptz) from public, anon, authenticated;
  end if;
end
$$;

comment on function public.kc_ingest_search_queries(text, jsonb) is
  'Ingestão de buscas (public INVOKER). EXECUTE: anon+authenticated. Implementação sem elevação de privilégio.';
comment on function public.kc_track_privacy_event(text, text, text, text, text, text, jsonb) is
  'Eventos de privacidade (public INVOKER). EXECUTE: anon+authenticated.';
comment on function public.kc_admin_search_trends(integer, timestamptz) is
  'Tendências de busca admin (public INVOKER). EXECUTE: authenticated. Backend em kc_private DEFINER.';
comment on function public.kc_admin_search_trends_classified(integer, timestamptz) is
  'Tendências classificadas admin (public INVOKER). EXECUTE: authenticated. Backend em kc_private DEFINER.';
