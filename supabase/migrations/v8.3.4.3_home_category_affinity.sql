-- Kino Campus -- V8.3.4.3
-- Afinidade personalizada de categorias da home + contagens agregadas

begin;

create table if not exists public.home_category_affinity (
  id uuid primary key default gen_random_uuid(),
  owner_kind text not null check (owner_kind in ('user', 'session')),
  owner_key text not null,
  user_id uuid references public.profiles(id) on delete cascade,
  session_id text,
  module_key text not null,
  category_key text not null,
  score numeric(12,2) not null default 0,
  interactions_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_category_affinity_owner_check check (
    (owner_kind = 'user' and user_id is not null and owner_key = user_id::text)
    or
    (owner_kind = 'session' and session_id is not null and owner_key = session_id)
  ),
  constraint home_category_affinity_unique unique (owner_kind, owner_key, module_key, category_key)
);

create index if not exists home_category_affinity_user_idx
  on public.home_category_affinity (user_id, score desc, updated_at desc);

create index if not exists home_category_affinity_session_idx
  on public.home_category_affinity (session_id, score desc, updated_at desc);

create index if not exists posts_status_module_category_idx
  on public.posts (status, module, category);

drop trigger if exists trg_home_category_affinity_updated_at on public.home_category_affinity;
create trigger trg_home_category_affinity_updated_at
  before update on public.home_category_affinity
  for each row execute function public.kc_set_updated_at();

alter table public.home_category_affinity enable row level security;

create or replace function public.kc_home_normalize_key(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(both '-' from
    regexp_replace(
      translate(
        lower(coalesce(p_value, '')),
        'áàãâäéèêëíìîïóòõôöúùûüç',
        'aaaaaeeeeiiiiooooouuuuc'
      ),
      '[^a-z0-9]+',
      '-',
      'g'
    )
  );
$$;

create or replace function public.kc_home_match_category(
  p_module_key text,
  p_category text default null,
  p_subcategory text default null,
  p_title text default null,
  p_description text default null
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_module text := public.kc_home_normalize_key(p_module_key);
  v_blob text := public.kc_home_normalize_key(
    concat_ws(
      ' ',
      coalesce(p_category, ''),
      coalesce(p_subcategory, ''),
      coalesce(p_title, ''),
      coalesce(p_description, '')
    )
  );
begin
  if v_module = 'compra-venda' then
    if v_blob like '%livro%' or v_blob like '%apostila%' or v_blob like '%material%' then
      return 'compra-venda:livros';
    elsif v_blob like '%eletron%' or v_blob like '%celular%' or v_blob like '%notebook%' or v_blob like '%tablet%' then
      return 'compra-venda:eletronicos';
    elsif v_blob like '%movel%' or v_blob like '%cadeira%' or v_blob like '%mesa%' or v_blob like '%armario%' then
      return 'compra-venda:moveis';
    elsif v_blob like '%vestuario%' or v_blob like '%roupa%' or v_blob like '%camisa%' or v_blob like '%casaco%' then
      return 'compra-venda:vestuario';
    else
      return 'compra-venda:outros';
    end if;
  elsif v_module = 'eventos' then
    if v_blob like '%sustentab%' or v_blob like '%ambiental%' or v_blob like '%eco%' then
      return 'eventos:sustentabilidade';
    elsif v_blob like '%academ%' or v_blob like '%palestra%' or v_blob like '%seminar%' or v_blob like '%congress%' then
      return 'eventos:academico';
    elsif v_blob like '%cultural%' or v_blob like '%show%' or v_blob like '%arte%' or v_blob like '%musica%' then
      return 'eventos:cultural';
    elsif v_blob like '%esport%' or v_blob like '%corrida%' or v_blob like '%torneio%' or v_blob like '%jogo%' then
      return 'eventos:esportivo';
    elsif v_blob like '%workshop%' or v_blob like '%oficina%' or v_blob like '%curso%' then
      return 'eventos:workshop';
    end if;
  elsif v_module = 'moradia' then
    if v_blob like '%republic%' then
      return 'moradia:republica';
    elsif v_blob like '%quarto%' then
      return 'moradia:quarto';
    elsif v_blob like '%apartament%' or v_blob like '%apto%' then
      return 'moradia:apartamento';
    elsif v_blob like '%casa%' then
      return 'moradia:casa';
    elsif v_blob like '%procur%' or v_blob like '%procuro%' then
      return 'moradia:procurando';
    end if;
  elsif v_module = 'oportunidades' then
    if v_blob like '%estagio%' then
      return 'oportunidades:estagio';
    elsif v_blob like '%emprego%' or v_blob like '%vaga%' or v_blob like '%clt%' then
      return 'oportunidades:emprego';
    elsif v_blob like '%freela%' or v_blob like '%freelancer%' then
      return 'oportunidades:freelancer';
    elsif v_blob like '%monitoria%' or v_blob like '%aula%' or v_blob like '%reforco%' then
      return 'oportunidades:monitoria';
    elsif v_blob like '%volunt%' or v_blob like '%ong%' or v_blob like '%extensao%' then
      return 'oportunidades:voluntariado';
    end if;
  elsif v_module = 'caronas' then
    if v_blob like '%ofere%' then
      return 'caronas:ofereco';
    elsif v_blob like '%procuro%' then
      return 'caronas:procuro';
    elsif v_blob like '%campus%' or v_blob like '%samambaia%' or v_blob like '%colemar%' then
      return 'caronas:campus';
    elsif v_blob like '%centro%' then
      return 'caronas:centro';
    end if;
  elsif v_module = 'achados-perdidos' then
    if v_blob like '%perdid%' or v_blob like '%sumi%' then
      return 'achados-perdidos:perdido';
    elsif v_blob like '%encontrad%' or v_blob like '%achad%' then
      return 'achados-perdidos:encontrado';
    elsif v_blob like '%documento%' or v_blob like '%rg%' or v_blob like '%cpf%' or v_blob like '%cartao%' then
      return 'achados-perdidos:documentos';
    elsif v_blob like '%eletron%' or v_blob like '%celular%' or v_blob like '%notebook%' then
      return 'achados-perdidos:eletronicos';
    else
      return 'achados-perdidos:outros';
    end if;
  end if;

  return null;
end;
$$;

create or replace function public.kc_track_home_category_affinity(
  p_session_id text default null,
  p_events jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_kind text;
  v_owner_key text;
  v_processed integer := 0;
  v_event jsonb;
  v_module_key text;
  v_category_key text;
  v_delta numeric(12,2);
  v_session_id text := nullif(trim(coalesce(p_session_id, '')), '');
begin
  if jsonb_typeof(p_events) is distinct from 'array' then
    return 0;
  end if;

  if v_user_id is not null then
    v_owner_kind := 'user';
    v_owner_key := v_user_id::text;
  elsif v_session_id is not null then
    v_owner_kind := 'session';
    v_owner_key := v_session_id;
  else
    return 0;
  end if;

  for v_event in
    select value from jsonb_array_elements(p_events)
  loop
    v_module_key := public.kc_home_normalize_key(v_event ->> 'module_key');
    v_category_key := public.kc_home_normalize_key(v_event ->> 'category_key');
    v_delta := greatest(0.5, least(50, coalesce((v_event ->> 'delta')::numeric, 0)));

    if v_module_key = '' or v_category_key = '' then
      continue;
    end if;

    insert into public.home_category_affinity (
      owner_kind,
      owner_key,
      user_id,
      session_id,
      module_key,
      category_key,
      score,
      interactions_count
    ) values (
      v_owner_kind,
      v_owner_key,
      v_user_id,
      case when v_owner_kind = 'session' then v_session_id else null end,
      v_module_key,
      v_category_key,
      v_delta,
      1
    )
    on conflict (owner_kind, owner_key, module_key, category_key)
    do update set
      score = public.home_category_affinity.score + excluded.score,
      interactions_count = public.home_category_affinity.interactions_count + 1,
      updated_at = now();

    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;

create or replace function public.kc_merge_home_category_affinity(
  p_session_id text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id text := nullif(trim(coalesce(p_session_id, '')), '');
  v_merged integer := 0;
begin
  if v_user_id is null or v_session_id is null then
    return 0;
  end if;

  insert into public.home_category_affinity (
    owner_kind,
    owner_key,
    user_id,
    session_id,
    module_key,
    category_key,
    score,
    interactions_count
  )
  select
    'user',
    v_user_id::text,
    v_user_id,
    null,
    hca.module_key,
    hca.category_key,
    hca.score,
    hca.interactions_count
  from public.home_category_affinity hca
  where hca.owner_kind = 'session'
    and hca.session_id = v_session_id
  on conflict (owner_kind, owner_key, module_key, category_key)
  do update set
    score = public.home_category_affinity.score + excluded.score,
    interactions_count = public.home_category_affinity.interactions_count + excluded.interactions_count,
    updated_at = now();

  get diagnostics v_merged = row_count;

  delete from public.home_category_affinity
  where owner_kind = 'session'
    and session_id = v_session_id;

  return coalesce(v_merged, 0);
end;
$$;

create or replace function public.kc_list_home_category_affinity(
  p_session_id text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  module_key text,
  category_key text,
  score numeric,
  interactions_count bigint,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with combined as (
    select
      hca.module_key,
      hca.category_key,
      hca.score,
      hca.interactions_count,
      hca.updated_at
    from public.home_category_affinity hca
    where (auth.uid() is not null and hca.owner_kind = 'user' and hca.user_id = auth.uid())
       or (nullif(trim(coalesce(p_session_id, '')), '') is not null and hca.owner_kind = 'session' and hca.session_id = nullif(trim(coalesce(p_session_id, '')), ''))
  )
  select
    module_key,
    category_key,
    sum(score)::numeric as score,
    sum(interactions_count)::bigint as interactions_count,
    max(updated_at) as updated_at
  from combined
  group by module_key, category_key
  order by score desc, interactions_count desc, category_key asc
  offset greatest(coalesce(p_offset, 0), 0)
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

create or replace function public.kc_home_category_post_counts()
returns table (
  module_key text,
  category_key text,
  count bigint
)
language sql
security definer
set search_path = public
as $$
  with matched as (
    select
      public.kc_home_match_category(
        p.module,
        p.category,
        p.subcategory,
        p.title,
        p.description
      ) as category_id
    from public.posts p
    where p.status = 'published'
  )
  select
    split_part(category_id, ':', 1) as module_key,
    split_part(category_id, ':', 2) as category_key,
    count(*)::bigint as count
  from matched
  where category_id is not null
  group by 1, 2
  order by 1, 2;
$$;

revoke all on table public.home_category_affinity from public;
grant all on table public.home_category_affinity to service_role;

revoke all on function public.kc_track_home_category_affinity(text, jsonb) from public;
revoke all on function public.kc_merge_home_category_affinity(text) from public;
revoke all on function public.kc_list_home_category_affinity(text, integer, integer) from public;
revoke all on function public.kc_home_category_post_counts() from public;

grant execute on function public.kc_track_home_category_affinity(text, jsonb) to anon, authenticated;
grant execute on function public.kc_merge_home_category_affinity(text) to authenticated;
grant execute on function public.kc_list_home_category_affinity(text, integer, integer) to anon, authenticated;
grant execute on function public.kc_home_category_post_counts() to anon, authenticated;

comment on table public.home_category_affinity is 'Afinidade personalizada de categorias da home por usuário autenticado ou sessão anônima.';
comment on function public.kc_track_home_category_affinity(text, jsonb) is 'Registra eventos ponderados de afinidade para categorias da home.';
comment on function public.kc_merge_home_category_affinity(text) is 'Mescla afinidade anônima da sessão atual com a conta autenticada.';
comment on function public.kc_list_home_category_affinity(text, integer, integer) is 'Lista categorias personalizadas para a home, combinando usuário autenticado e sessão local.';
comment on function public.kc_home_category_post_counts() is 'Retorna contagens agregadas de publicações ativas por categoria da home.';

commit;
