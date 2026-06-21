begin;

create or replace function public.kc_related_posts(
  p_post_id uuid,
  p_limit integer default 8
)
returns table (
  candidate_id uuid,
  relevance_score integer,
  reason text
)
language sql
stable
set search_path = public
as $$
  with current_post as (
    select
      p.id,
      p.author_id,
      p.module,
      p.category,
      coalesce(nullif(p.metadata ->> 'subcategoryKey', ''), nullif(p.metadata ->> 'subcategoriaKey', ''), nullif(p.metadata ->> 'subcategory', ''), nullif(p.metadata ->> 'subcategoria', '')) as subcategory,
      array(
        select distinct lower(trim(value))
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(p.metadata -> 'tagKeys') = 'array' then p.metadata -> 'tagKeys'
            when jsonb_typeof(p.metadata -> 'tags') = 'array' then p.metadata -> 'tags'
            else '[]'::jsonb
          end
        ) as value
        where trim(value) <> ''
      ) as tags,
      array(
        select distinct lower(token)
        from regexp_split_to_table(
          regexp_replace(
            lower(coalesce(p.title, '') || ' ' || coalesce(p.description, '')),
            '[^[:alnum:][:space:]]+',
            ' ',
            'g'
          ),
          '\s+'
        ) as token
        where length(token) >= 3
      ) as terms
    from public.posts p
    where p.id = p_post_id
      and p.status = 'published'
    limit 1
  ),
  candidates as (
    select
      p.id,
      p.author_id,
      p.module,
      p.category,
      coalesce(nullif(p.metadata ->> 'subcategoryKey', ''), nullif(p.metadata ->> 'subcategoriaKey', ''), nullif(p.metadata ->> 'subcategory', ''), nullif(p.metadata ->> 'subcategoria', '')) as subcategory,
      coalesce(p.votos, 0) as votos,
      p.created_at,
      array(
        select distinct lower(trim(value))
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(p.metadata -> 'tagKeys') = 'array' then p.metadata -> 'tagKeys'
            when jsonb_typeof(p.metadata -> 'tags') = 'array' then p.metadata -> 'tags'
            else '[]'::jsonb
          end
        ) as value
        where trim(value) <> ''
      ) as tags,
      array(
        select distinct lower(token)
        from regexp_split_to_table(
          regexp_replace(
            lower(coalesce(p.title, '') || ' ' || coalesce(p.description, '')),
            '[^[:alnum:][:space:]]+',
            ' ',
            'g'
          ),
          '\s+'
        ) as token
        where length(token) >= 3
      ) as terms
    from public.posts p
    where p.status = 'published'
      and p.id <> p_post_id
  ),
  scored as (
    select
      c.id as candidate_id,
      (
        case
          when c.author_id = cp.author_id and c.module = cp.module then 160
          when c.author_id = cp.author_id then 120
          else 0
        end
        + case when c.module = cp.module then 60 else 0 end
        + case when c.category = cp.category then 40 else 0 end
        + case when coalesce(c.subcategory, '') <> '' and c.subcategory = cp.subcategory then 30 else 0 end
        + least(
            (
              select count(*)
              from unnest(coalesce(c.tags, array[]::text[])) as candidate_tag
              join unnest(coalesce(cp.tags, array[]::text[])) as current_tag
                on candidate_tag = current_tag
            ) * 6,
            48
          )
        + least(
            (
              select count(*)
              from unnest(coalesce(c.terms, array[]::text[])) as candidate_term
              join unnest(coalesce(cp.terms, array[]::text[])) as current_term
                on candidate_term = current_term
            ) * 4,
            24
          )
        + least(greatest(c.votos, 0) / 2, 12)
        + case
            when c.created_at >= now() - interval '2 days' then 8
            when c.created_at >= now() - interval '7 days' then 5
            when c.created_at >= now() - interval '21 days' then 2
            else 0
          end
      )::integer as relevance_score,
      case
        when c.author_id = cp.author_id and c.module = cp.module then 'Mesmo autor e módulo'
        when c.author_id = cp.author_id then 'Mesmo autor'
        when c.module = cp.module then 'Mesmo módulo'
        when c.category = cp.category then 'Mesma categoria'
        when coalesce(c.subcategory, '') <> '' and c.subcategory = cp.subcategory then 'Mesma subcategoria'
        else 'Relacionado'
      end as reason,
      c.created_at
    from candidates c
    cross join current_post cp
  )
  select
    candidate_id,
    relevance_score,
    reason
  from scored
  where relevance_score > 0
  order by relevance_score desc, created_at desc
  limit greatest(1, least(coalesce(p_limit, 8), 12));
$$;

grant execute on function public.kc_related_posts(uuid, integer) to anon, authenticated;

commit;
