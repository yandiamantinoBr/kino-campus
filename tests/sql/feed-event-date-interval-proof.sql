-- Run after 20260808152842_feed_event_interval_filters_20260808.sql.
do $$
declare
  v_now timestamptz := '2026-08-08 12:00:00-03'::timestamptz;
begin
  if not public.kc_feed_matches_date_preset(
    'eventos', v_now, '{"data_evento":"2026-08-07","data_fim_evento":"2026-09-25"}'::jsonb, 'today', v_now
  ) then raise exception 'ongoing event must match today'; end if;

  if public.kc_feed_matches_date_preset(
    'eventos', v_now, '{"data_evento":"2026-08-07","data_fim_evento":"2026-09-25"}'::jsonb, 'past', v_now
  ) then raise exception 'ongoing event must not match past'; end if;

  if not public.kc_feed_matches_date_preset(
    'eventos', v_now, '{"data_evento":"2026-08-01","data_fim_evento":"2026-08-20"}'::jsonb, 'next7d', v_now
  ) then raise exception 'overlapping event must match next7d'; end if;

  if not public.kc_feed_matches_date_preset(
    'eventos', v_now, '{"data_evento":"2026-07-20","data_fim_evento":"2026-08-02"}'::jsonb, 'thisMonth', v_now
  ) then raise exception 'cross-month event must match thisMonth'; end if;

  if public.kc_feed_matches_date_preset(
    'eventos', v_now, '{}'::jsonb, 'today', v_now
  ) then raise exception 'undated event must not inherit created_at'; end if;

  if public.kc_feed_matches_date_preset(
    'eventos', v_now, '{"data_evento":"2026-99-99"}'::jsonb, 'today', v_now
  ) then raise exception 'invalid civil date must not match'; end if;

  if not public.kc_feed_matches_date_preset(
    'moradia', '2026-08-04 10:00:00-03'::timestamptz, '{}'::jsonb, 'last7d', v_now
  ) then raise exception 'generic recency behavior must remain unchanged'; end if;
end;
$$;
