-- Restrict administrative RPC discovery/execution and make banner updates fail closed.

create or replace function public.kc_admin_save_banner(p_data jsonb)
returns public.hero_banners
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_id uuid;
  v_result public.hero_banners;
  v_action text;
begin
  if v_admin is null or not public.kc_is_admin(v_admin) then
    raise exception 'Acesso negado: apenas administradores podem salvar banners.';
  end if;

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Dados do banner inválidos.' using errcode = '22023';
  end if;

  v_id := nullif(p_data->>'id', '')::uuid;

  if v_id is not null then
    update public.hero_banners
    set
      pill_text = coalesce(p_data->>'pill_text', pill_text),
      title = coalesce(p_data->>'title', title),
      subtitle = coalesce(p_data->>'subtitle', subtitle),
      button_text = coalesce(p_data->>'button_text', button_text),
      button_url = coalesce(p_data->>'button_url', button_url),
      icon_class = coalesce(p_data->>'icon_class', icon_class),
      gradient_from = coalesce(p_data->>'gradient_from', gradient_from),
      gradient_to = coalesce(p_data->>'gradient_to', gradient_to),
      sort_order = coalesce((p_data->>'sort_order')::integer, sort_order),
      is_active = coalesce((p_data->>'is_active')::boolean, is_active),
      updated_by = v_admin
    where id = v_id
    returning * into v_result;

    if not found then
      raise exception 'Banner não encontrado.' using errcode = 'P0002';
    end if;
    v_action := 'update';
  else
    insert into public.hero_banners (
      pill_text,
      title,
      subtitle,
      button_text,
      button_url,
      icon_class,
      gradient_from,
      gradient_to,
      sort_order,
      is_active,
      created_by,
      updated_by
    ) values (
      coalesce(p_data->>'pill_text', 'Destaque'),
      p_data->>'title',
      coalesce(p_data->>'subtitle', ''),
      coalesce(p_data->>'button_text', 'Ver mais'),
      coalesce(p_data->>'button_url', '#'),
      coalesce(p_data->>'icon_class', 'fas fa-star'),
      coalesce(p_data->>'gradient_from', '#4F46E5'),
      coalesce(p_data->>'gradient_to', '#7C3AED'),
      coalesce((p_data->>'sort_order')::integer, 0),
      coalesce((p_data->>'is_active')::boolean, true),
      v_admin,
      v_admin
    )
    returning * into v_result;
    v_action := 'create';
  end if;

  insert into public.hero_banner_audit (banner_id, action, changed_by, snapshot)
  values (v_result.id, v_action, v_admin, to_jsonb(v_result));

  return v_result;
end;
$$;

-- Supabase grants EXECUTE on new public functions broadly by default. Administrative
-- RPCs authenticate internally, but anonymous callers do not need this surface.
do $$
declare
  v_signature regprocedure;
begin
  for v_signature in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'kc_admin_%'
  loop
    execute format('revoke all on function %s from public, anon', v_signature);
    execute format('grant execute on function %s to authenticated, service_role', v_signature);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
