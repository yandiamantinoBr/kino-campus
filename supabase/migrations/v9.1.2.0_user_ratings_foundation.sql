begin;

alter table public.profiles
  add column if not exists rating_avg numeric(3,2);

alter table public.profiles
  add column if not exists rating_count integer not null default 0;

update public.profiles
   set rating_count = 0
 where rating_count is null;

alter table public.profiles
  alter column rating_count set default 0;

alter table public.profiles
  alter column rating_count set not null;

create table if not exists public.user_ratings (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  rater_user_id uuid not null references public.profiles(id) on delete cascade,
  context_post_id uuid references public.posts(id) on delete set null,
  rating smallint not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_ratings_rating_range check (rating between 1 and 5),
  constraint user_ratings_comment_len check (char_length(coalesce(comment, '')) <= 280),
  constraint user_ratings_no_self check (target_user_id <> rater_user_id),
  constraint user_ratings_unique_pair unique (rater_user_id, target_user_id)
);

create index if not exists user_ratings_target_created_idx
  on public.user_ratings (target_user_id, created_at desc, id desc);

create index if not exists user_ratings_rater_idx
  on public.user_ratings (rater_user_id);

create index if not exists user_ratings_context_post_idx
  on public.user_ratings (context_post_id);

alter table public.user_ratings enable row level security;

drop policy if exists user_ratings_select_own on public.user_ratings;
create policy user_ratings_select_own
  on public.user_ratings
  for select
  to authenticated
  using (
    rater_user_id = (select auth.uid())
    or target_user_id = (select auth.uid())
  );

drop policy if exists user_ratings_insert_own on public.user_ratings;
create policy user_ratings_insert_own
  on public.user_ratings
  for insert
  to authenticated
  with check (
    rater_user_id = (select auth.uid())
    and rater_user_id <> target_user_id
  );

drop policy if exists user_ratings_update_own on public.user_ratings;
create policy user_ratings_update_own
  on public.user_ratings
  for update
  to authenticated
  using (rater_user_id = (select auth.uid()))
  with check (
    rater_user_id = (select auth.uid())
    and rater_user_id <> target_user_id
  );

create or replace function public.kc_user_ratings_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.kc_sync_profile_rating_aggregates(p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles as p
     set rating_avg = agg.avg_rating,
         rating_count = agg.rating_count
    from (
      select
        p_target_user_id as target_user_id,
        case
          when count(*) = 0 then null
          else round(avg(ur.rating)::numeric, 2)
        end as avg_rating,
        count(*)::int as rating_count
      from public.user_ratings as ur
      where ur.target_user_id = p_target_user_id
    ) as agg
   where p.id = agg.target_user_id;
end;
$$;

create or replace function public.kc_user_ratings_sync_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.kc_sync_profile_rating_aggregates(old.target_user_id);
    return old;
  end if;

  perform public.kc_sync_profile_rating_aggregates(new.target_user_id);

  if tg_op = 'UPDATE'
     and old.target_user_id is distinct from new.target_user_id then
    perform public.kc_sync_profile_rating_aggregates(old.target_user_id);
  end if;

  return new;
end;
$$;

drop trigger if exists kc_trigger_user_ratings_set_updated_at on public.user_ratings;
create trigger kc_trigger_user_ratings_set_updated_at
  before update on public.user_ratings
  for each row
  execute function public.kc_user_ratings_set_updated_at();

drop trigger if exists kc_trigger_user_ratings_sync_target on public.user_ratings;
create trigger kc_trigger_user_ratings_sync_target
  after insert or update or delete on public.user_ratings
  for each row
  execute function public.kc_user_ratings_sync_target();

create or replace function public.kc_get_user_rating_summary(p_target_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'userId', p.id,
        'average', case
          when coalesce(p.rating_count, 0) > 0 then round(coalesce(p.rating_avg, 0)::numeric, 2)
          else null
        end,
        'count', coalesce(p.rating_count, 0)
      )
      from public.profiles as p
      where p.id = p_target_user_id
    ),
    jsonb_build_object(
      'userId', p_target_user_id,
      'average', null,
      'count', 0
    )
  );
$$;

create or replace function public.kc_get_user_rating_state(p_target_user_id uuid, p_context_post_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_reason text := 'OK';
  v_can_rate boolean := false;
  v_target_exists boolean := false;
  v_context_valid boolean := true;
  v_has_interaction boolean := false;
  v_my_rating jsonb := null;
begin
  select exists(
    select 1
    from public.profiles as p
    where p.id = p_target_user_id
  ) into v_target_exists;

  if v_target_exists and v_actor_id is not null then
    select jsonb_build_object(
      'id', ur.id,
      'targetUserId', ur.target_user_id,
      'raterUserId', ur.rater_user_id,
      'contextPostId', ur.context_post_id,
      'rating', ur.rating,
      'comment', ur.comment,
      'createdAt', ur.created_at,
      'updatedAt', ur.updated_at
    )
      into v_my_rating
      from public.user_ratings as ur
     where ur.target_user_id = p_target_user_id
       and ur.rater_user_id = v_actor_id
     limit 1;
  end if;

  if not v_target_exists then
    v_reason := 'TARGET_NOT_FOUND';
  elsif v_actor_id is null then
    v_reason := 'AUTH_REQUIRED';
  elsif v_actor_id = p_target_user_id then
    v_reason := 'SELF';
  else
    if p_context_post_id is not null then
      select exists(
        select 1
        from public.posts as p
        where p.id = p_context_post_id
          and p.author_id = p_target_user_id
      ) into v_context_valid;
    end if;

    if not v_context_valid then
      v_reason := 'INVALID_CONTEXT';
    elsif v_my_rating is not null then
      v_can_rate := true;
      v_reason := 'OK';
    else
      select exists(
        select 1
        from public.posts as p
        where p.author_id = p_target_user_id
          and (
            p_context_post_id is null
            or p.id = p_context_post_id
          )
          and (
            exists(
              select 1
              from public.comments as c
              where c.post_id = p.id
                and c.author_id = v_actor_id
            )
            or exists(
              select 1
              from public.post_votes as pv
              where pv.post_id = p.id
                and pv.voter_id = v_actor_id
            )
            or exists(
              select 1
              from public.saved_posts as sp
              where sp.post_id = p.id
                and sp.user_id = v_actor_id
            )
          )
      ) into v_has_interaction;

      if v_has_interaction then
        v_can_rate := true;
        v_reason := 'OK';
      else
        v_reason := 'NO_INTERACTION';
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'targetUserId', p_target_user_id,
    'contextPostId', p_context_post_id,
    'canRate', v_can_rate,
    'reason', v_reason,
    'myRating', v_my_rating
  );
end;
$$;

create or replace function public.kc_list_user_ratings(
  p_target_user_id uuid,
  p_page integer default 1,
  p_limit integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_limit integer := least(50, greatest(1, coalesce(p_limit, 10)));
  v_offset integer := (v_page - 1) * v_limit;
  v_target_public boolean := false;
  v_total integer := 0;
  v_items jsonb := '[]'::jsonb;
begin
  select coalesce(p.profile_public, false)
    into v_target_public
    from public.profiles as p
   where p.id = p_target_user_id;

  if not found then
    return jsonb_build_object(
      'items', '[]'::jsonb,
      'page', v_page,
      'limit', v_limit,
      'total', 0,
      'hasMore', false
    );
  end if;

  if not v_target_public and v_actor_id is distinct from p_target_user_id then
    return jsonb_build_object(
      'items', '[]'::jsonb,
      'page', v_page,
      'limit', v_limit,
      'total', 0,
      'hasMore', false
    );
  end if;

  select count(*)::int
    into v_total
    from public.user_ratings as ur
   where ur.target_user_id = p_target_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ur.id,
        'targetUserId', ur.target_user_id,
        'raterUserId', case when coalesce(rp.profile_public, false) then ur.rater_user_id else null end,
        'contextPostId', ur.context_post_id,
        'rating', ur.rating,
        'comment', ur.comment,
        'createdAt', ur.created_at,
        'updatedAt', ur.updated_at,
        'reviewer', jsonb_build_object(
          'id', case when coalesce(rp.profile_public, false) then rp.id else null end,
          'displayName', case
            when coalesce(rp.profile_public, false)
              then coalesce(nullif(btrim(rp.display_name), ''), nullif(btrim(rp.full_name), ''), 'Membro da comunidade')
            else 'Membro da comunidade'
          end,
          'avatarUrl', case when coalesce(rp.profile_public, false) then nullif(btrim(rp.avatar_url), '') else null end,
          'public', coalesce(rp.profile_public, false)
        )
      )
      order by ur.created_at desc, ur.id desc
    ),
    '[]'::jsonb
  )
    into v_items
    from (
      select *
        from public.user_ratings
       where target_user_id = p_target_user_id
       order by created_at desc, id desc
       offset v_offset
       limit v_limit
    ) as ur
    left join public.profiles as rp
      on rp.id = ur.rater_user_id;

  return jsonb_build_object(
    'items', v_items,
    'page', v_page,
    'limit', v_limit,
    'total', v_total,
    'hasMore', (v_offset + jsonb_array_length(v_items)) < v_total
  );
end;
$$;

create or replace function public.kc_upsert_user_rating(
  p_target_user_id uuid,
  p_context_post_id uuid default null,
  p_rating integer default null,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_state jsonb;
  v_can_rate boolean := false;
  v_reason text := 'UNKNOWN';
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_row public.user_ratings%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Faça login para avaliar este usuário.'
      using errcode = 'P0001';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'A nota deve estar entre 1 e 5 estrelas.'
      using errcode = 'P0001';
  end if;

  if char_length(coalesce(v_comment, '')) > 280 then
    raise exception 'O comentário da avaliação aceita no máximo 280 caracteres.'
      using errcode = 'P0001';
  end if;

  v_state := public.kc_get_user_rating_state(p_target_user_id, p_context_post_id);
  v_can_rate := coalesce((v_state ->> 'canRate')::boolean, false);
  v_reason := coalesce(v_state ->> 'reason', 'UNKNOWN');

  if not v_can_rate then
    if v_reason = 'SELF' then
      raise exception 'Você não pode avaliar o próprio perfil.'
        using errcode = 'P0001';
    elsif v_reason = 'NO_INTERACTION' then
      raise exception 'Interaja com um post deste usuário antes de avaliá-lo.'
        using errcode = 'P0001';
    elsif v_reason = 'INVALID_CONTEXT' then
      raise exception 'A avaliação precisa estar vinculada a uma publicação válida deste usuário.'
        using errcode = 'P0001';
    elsif v_reason = 'TARGET_NOT_FOUND' then
      raise exception 'Usuário alvo não encontrado para avaliação.'
        using errcode = 'P0001';
    else
      raise exception 'Não foi possível registrar esta avaliação agora.'
        using errcode = 'P0001';
    end if;
  end if;

  insert into public.user_ratings (
    target_user_id,
    rater_user_id,
    context_post_id,
    rating,
    comment
  )
  values (
    p_target_user_id,
    v_actor_id,
    p_context_post_id,
    p_rating,
    v_comment
  )
  on conflict (rater_user_id, target_user_id)
  do update
    set context_post_id = coalesce(excluded.context_post_id, public.user_ratings.context_post_id),
        rating = excluded.rating,
        comment = excluded.comment,
        updated_at = now()
  returning *
    into v_row;

  return jsonb_build_object(
    'ok', true,
    'rating', jsonb_build_object(
      'id', v_row.id,
      'targetUserId', v_row.target_user_id,
      'raterUserId', v_row.rater_user_id,
      'contextPostId', v_row.context_post_id,
      'rating', v_row.rating,
      'comment', v_row.comment,
      'createdAt', v_row.created_at,
      'updatedAt', v_row.updated_at
    ),
    'summary', public.kc_get_user_rating_summary(p_target_user_id)
  );
end;
$$;

grant execute on function public.kc_get_user_rating_summary(uuid) to anon, authenticated;
grant execute on function public.kc_list_user_ratings(uuid, integer, integer) to anon, authenticated;
grant execute on function public.kc_get_user_rating_state(uuid, uuid) to authenticated;
grant execute on function public.kc_upsert_user_rating(uuid, uuid, integer, text) to authenticated;

update public.profiles as p
   set rating_avg = agg.avg_rating,
       rating_count = agg.rating_count
  from (
    select
      ur.target_user_id,
      round(avg(ur.rating)::numeric, 2) as avg_rating,
      count(*)::int as rating_count
    from public.user_ratings as ur
    group by ur.target_user_id
  ) as agg
 where p.id = agg.target_user_id;

update public.profiles
   set rating_avg = null,
       rating_count = 0
 where id not in (
   select distinct ur.target_user_id
   from public.user_ratings as ur
 );

commit;
