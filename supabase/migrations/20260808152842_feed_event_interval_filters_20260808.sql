-- Keep event date presets consistent with the browser and calendar.
-- Events without a valid start date are not assigned to a date bucket.

create or replace function public.kc_feed_event_local_date(
  p_metadata jsonb,
  p_created_at timestamptz
)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_raw text := btrim(coalesce(
    v_meta->>'data_evento',
    v_meta->>'dataEvento',
    v_meta->>'data',
    ''
  ));
begin
  if v_raw !~ '^\d{4}-\d{2}-\d{2}' then
    return null;
  end if;

  begin
    return substring(v_raw from 1 for 10)::date;
  exception when others then
    return null;
  end;
end;
$$;

create or replace function public.kc_feed_matches_date_preset(
  p_module text,
  p_created_at timestamptz,
  p_metadata jsonb,
  p_preset text,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_module text := public.kc_feed_normalize_text(p_module);
  v_preset text := public.kc_feed_normalize_text(p_preset);
  v_today date := public.kc_feed_local_date(coalesce(p_now, now()));
  v_candidate date;
  v_event_start date;
  v_event_end date;
  v_event_end_raw text;
  v_month_start date;
  v_month_end date;
begin
  if v_preset = '' then
    return true;
  end if;

  if v_module in ('compra-venda', 'livros', 'moradia', 'oportunidades', 'achados-perdidos')
     and v_preset not in ('today', 'last7d', 'last30d') then
    return true;
  end if;

  if v_module = 'caronas'
     and v_preset not in ('today', 'last3d', 'last7d') then
    return true;
  end if;

  if v_module = 'eventos'
     and v_preset not in ('today', 'next7d', 'thismonth', 'past') then
    return true;
  end if;

  if v_today is null then
    return false;
  end if;

  if v_module = 'eventos' then
    v_event_start := public.kc_feed_event_local_date(p_metadata, p_created_at);
    if v_event_start is null then
      return false;
    end if;

    v_event_end_raw := btrim(coalesce(
      p_metadata->>'data_fim_evento',
      p_metadata->>'dataFimEvento',
      p_metadata->>'data_fim',
      p_metadata->>'dataFim',
      ''
    ));
    v_event_end := v_event_start;
    if v_event_end_raw ~ '^\d{4}-\d{2}-\d{2}' then
      begin
        v_event_end := substring(v_event_end_raw from 1 for 10)::date;
      exception when others then
        v_event_end := v_event_start;
      end;
    end if;
    if v_event_end < v_event_start then
      v_event_end := v_event_start;
    end if;

    if v_preset = 'today' then
      return v_event_start <= v_today and v_event_end >= v_today;
    end if;
    if v_preset = 'next7d' then
      return v_event_start <= (v_today + 6) and v_event_end >= v_today;
    end if;
    if v_preset = 'thismonth' then
      v_month_start := date_trunc('month', v_today::timestamp)::date;
      v_month_end := (v_month_start + interval '1 month - 1 day')::date;
      return v_event_start <= v_month_end and v_event_end >= v_month_start;
    end if;
    if v_preset = 'past' then
      return v_event_end < v_today;
    end if;
    return true;
  end if;

  v_candidate := public.kc_feed_local_date(p_created_at);
  if v_candidate is null then
    return false;
  end if;
  if v_preset = 'today' then
    return v_candidate = v_today;
  end if;
  if v_preset = 'last3d' then
    return v_candidate between (v_today - 2) and v_today;
  end if;
  if v_preset = 'last7d' then
    return v_candidate between (v_today - 6) and v_today;
  end if;
  if v_preset = 'last30d' then
    return v_candidate between (v_today - 29) and v_today;
  end if;
  return true;
end;
$$;

comment on function public.kc_feed_event_local_date(jsonb, timestamptz)
  is 'Returns a valid event start date only; never substitutes post creation time.';

comment on function public.kc_feed_matches_date_preset(text, timestamptz, jsonb, text, timestamptz)
  is 'Matches feed date presets; event presets use inclusive start/end interval overlap.';
