\set ON_ERROR_STOP on
\pset pager off
\timing on

\echo 'KC_PROOF phase=bootstrap environment=disposable-postgresql-17 synthetic-only=true'

select current_setting('server_version') as server_version,
  current_setting('server_version_num') as server_version_num;
set statement_timeout = '60s';
set lock_timeout = '2s';
set idle_in_transaction_session_timeout = '30s';

drop schema if exists proof cascade;
drop schema if exists private cascade;
drop schema if exists auth cascade;
drop schema public cascade;
create schema public;
create schema auth;
create schema private;
create schema proof;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
revoke all on schema private from public, anon, authenticated;

create extension if not exists unaccent with schema public;
create extension if not exists pg_trgm with schema public;

create or replace function auth.uid()
returns uuid language sql stable set search_path = '' as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.role()
returns text language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user)
$$;

create table public.profiles (
  id uuid primary key,
  is_admin boolean not null default false
);

create table public.posts (
  id uuid primary key,
  legacy_id text,
  author_id uuid not null,
  title text not null,
  description text not null default '',
  price numeric,
  location text,
  module text not null,
  category text,
  status text not null default 'published',
  visibility text not null default 'public',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  votos integer not null default 0,
  highlight_score double precision not null default 0
);

alter table public.posts enable row level security;
grant select on public.posts to anon, authenticated, service_role;

create or replace function public.kc_is_admin(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = p_user_id and p.is_admin = true)
$$;

create or replace function public.kc_can_read_post(p_author_id uuid, p_status text, p_visibility text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select case
    when coalesce(auth.role(), 'anon') = 'authenticated' then
      (
        (coalesce(p_status, 'published') = 'published' and coalesce(p_visibility, 'public') in ('public', 'community'))
        or (select auth.uid()) = p_author_id
        or public.kc_is_admin((select auth.uid()))
      )
    else
      coalesce(p_status, 'published') = 'published' and coalesce(p_visibility, 'public') = 'public'
  end
$$;

revoke all on function public.kc_is_admin(uuid) from public;
revoke all on function public.kc_can_read_post(uuid, text, text) from public;
grant execute on function public.kc_is_admin(uuid) to anon, authenticated, service_role;
grant execute on function public.kc_can_read_post(uuid, text, text) to anon, authenticated, service_role;

create policy posts_select_public_anon on public.posts for select to anon
  using (public.kc_can_read_post(author_id, status, visibility));
create policy posts_select_authenticated on public.posts for select to authenticated
  using (public.kc_can_read_post(author_id, status, visibility));

create or replace function public.kc_unaccent(input_text text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select public.unaccent('public.unaccent'::regdictionary, coalesce(input_text, ''))
$$;

create or replace function public.kc_posts_search_subcategory(p_metadata jsonb)
returns text language sql immutable parallel safe set search_path = '' as $$
  select coalesce(p_metadata->>'subcategoria', p_metadata->>'subcategory',
    p_metadata->>'subcategoriaKey', p_metadata->>'subcategoryKey', '')
$$;

create or replace function public.kc_posts_search_tags_text(p_metadata jsonb)
returns text language sql immutable parallel safe set search_path = '' as $$
  select trim(concat_ws(' ',
    coalesce((select string_agg(value, ' ') from jsonb_array_elements_text(coalesce(p_metadata->'tags', '[]'::jsonb)) value), ''),
    coalesce((select string_agg(value, ' ') from jsonb_array_elements_text(coalesce(p_metadata->'tagKeys', '[]'::jsonb)) value), '')
  ))
$$;

create or replace function public.kc_posts_search_document(
  p_title text, p_description text, p_category text, p_metadata jsonb
)
returns tsvector language sql immutable parallel safe set search_path = '' as $$
  select
    setweight(to_tsvector('portuguese', public.kc_unaccent(coalesce(p_title, ''))), 'A') ||
    setweight(to_tsvector('portuguese', public.kc_unaccent(public.kc_posts_search_tags_text(coalesce(p_metadata, '{}'::jsonb)))), 'B') ||
    setweight(to_tsvector('portuguese', public.kc_unaccent(coalesce(p_description, ''))), 'C') ||
    setweight(to_tsvector('portuguese', public.kc_unaccent(coalesce(p_category, ''))), 'D') ||
    setweight(to_tsvector('portuguese', public.kc_unaccent(public.kc_posts_search_subcategory(coalesce(p_metadata, '{}'::jsonb)))), 'D')
$$;

create index idx_posts_fts on public.posts using gin (
  public.kc_posts_search_document(title, description, category, metadata)
) where legacy_id is null;

create or replace function public.kc_safe_numeric(value jsonb)
returns numeric language plpgsql immutable set search_path = '' as $$
begin
  return nullif(value #>> '{}', '')::numeric;
exception when invalid_text_representation then return null;
end
$$;

revoke all on function public.kc_unaccent(text) from public;
revoke all on function public.kc_posts_search_subcategory(jsonb) from public;
revoke all on function public.kc_posts_search_tags_text(jsonb) from public;
revoke all on function public.kc_posts_search_document(text, text, text, jsonb) from public;
revoke all on function public.kc_safe_numeric(jsonb) from public;
grant execute on function public.kc_unaccent(text), public.kc_posts_search_subcategory(jsonb),
  public.kc_posts_search_tags_text(jsonb), public.kc_posts_search_document(text, text, text, jsonb),
  public.kc_safe_numeric(jsonb) to anon, authenticated, service_role;

-- Baseline equivalent to the current public RPC shape, reduced to synthetic post payloads.
create or replace function public.kc_search_posts_fts(
  p_q text default null, p_terms text[] default null, p_module text default null,
  p_category text default null, p_subcategory text default null, p_limit integer default 50
)
returns setof jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 50));
  v_terms text[];
  v_query tsquery;
begin
  if coalesce(btrim(p_q), '') = '' then return; end if;
  v_terms := array(select distinct lower(btrim(public.kc_unaccent(term)))
    from unnest(coalesce(p_terms, array[p_q])) term where coalesce(btrim(term), '') <> '');
  select to_tsquery('portuguese', string_agg('(' || plainto_tsquery('portuguese', term)::text || ')', ' | '))
    into v_query from unnest(v_terms) term;
  return query
  with ranked as (
    select p.*, public.kc_posts_search_document(p.title, p.description, p.category, p.metadata) doc,
      lower(public.kc_unaccent(concat_ws(' ', p.title, p.module, p.category,
        public.kc_posts_search_subcategory(p.metadata), public.kc_posts_search_tags_text(p.metadata)))) fuzzy_text
    from public.posts p
    where p.legacy_id is null
      and (p_module is null or lower(p.module) = lower(p_module))
      and (p_category is null or lower(public.kc_unaccent(p.category)) = lower(public.kc_unaccent(p_category)))
      and (p_subcategory is null or lower(public.kc_unaccent(public.kc_posts_search_subcategory(p.metadata))) = lower(public.kc_unaccent(p_subcategory)))
  ), matched as (
    select ranked.*, ranked.doc @@ v_query is_fts, ts_rank_cd(ranked.doc, v_query) search_rank,
      (select coalesce(max(public.word_similarity(term, ranked.fuzzy_text)), 0) from unnest(v_terms) term where length(term) >= 4) fuzzy_sim
    from ranked
    where ranked.doc @@ v_query or exists (
      select 1 from unnest(v_terms) term where length(term) >= 4 and public.word_similarity(term, ranked.fuzzy_text) >= 0.5
    )
  )
  select jsonb_build_object('id', id, 'author_id', author_id, 'title', title,
    'module', module, 'category', category, 'status', status, 'visibility', visibility,
    'metadata', metadata, 'relevance_score', search_rank)
  from matched order by is_fts desc, search_rank desc, fuzzy_sim desc, created_at desc, id desc limit v_limit;
end
$$;

revoke all on function public.kc_search_posts_fts(text, text[], text, text, text, integer) from public;
grant execute on function public.kc_search_posts_fts(text, text[], text, text, text, integer) to anon, authenticated;

-- Candidate wrapper. Deliberately self-contained: invoker RLS remains in force and
-- no private core needs an API grant.
create or replace function public.kc_search_posts_structured_v1(
  p_q text, p_terms text[] default null, p_module text default null,
  p_category text default null, p_subcategory text default null,
  p_filters jsonb default '{}'::jsonb, p_limit integer default 50
)
returns setof jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 50));
  v_terms text[];
  v_query tsquery;
  v_key text;
  v_spec jsonb;
  v_op text;
  v_allowed_groups jsonb := '{
    "achados-perdidos":["status","tipo"], "caronas":["tipo"],
    "compra-venda":["categoria","acao"], "eventos":["topico"],
    "moradia":["tipo"], "oportunidades":["tipo"]
  }'::jsonb;
  v_allowed_fields jsonb := '{
    "achados-perdidos":["entrega","localizacao","recompensa"],
    "caronas":["contribuicao","destino","horario","marcadoresCarona","origem","vagas"],
    "compra-venda":["condicao","localizacao","preco"],
    "eventos":["data","data_fim","gratuito","hora","localizacao","preco"],
    "moradia":["localizacao","marcadoresMoradia","orcamento","preco","regiao"],
    "oportunidades":["areaAtuacao","localizacao","modalidadeTrabalho","regimeContratacao","remuneracao"]
  }'::jsonb;
begin
  if coalesce(btrim(p_q), '') = '' or length(p_q) > 160 then raise exception 'KC_SEARCH_INVALID_QUERY'; end if;
  if p_module is not null and not (v_allowed_groups ? p_module) then raise exception 'KC_SEARCH_INVALID_MODULE'; end if;
  if p_filters is null then p_filters := '{}'::jsonb; end if;
  if jsonb_typeof(p_filters) <> 'object' or octet_length(p_filters::text) > 8192 then raise exception 'KC_SEARCH_INVALID_FILTERS'; end if;
  if exists (select 1 from jsonb_object_keys(p_filters) key where key not in ('groups', 'fields')) then raise exception 'KC_SEARCH_UNKNOWN_FILTER_SECTION'; end if;
  if (p_filters ? 'groups' or p_filters ? 'fields') and p_module is null then raise exception 'KC_SEARCH_MODULE_REQUIRED'; end if;
  if p_filters ? 'groups' and jsonb_typeof(p_filters->'groups') <> 'object' then raise exception 'KC_SEARCH_INVALID_GROUPS'; end if;
  if p_filters ? 'fields' and jsonb_typeof(p_filters->'fields') <> 'object' then raise exception 'KC_SEARCH_INVALID_FIELDS'; end if;

  for v_key, v_spec in select * from jsonb_each(coalesce(p_filters->'groups', '{}'::jsonb)) loop
    if not ((v_allowed_groups->p_module) ? v_key) or jsonb_typeof(v_spec) <> 'array'
       or jsonb_array_length(v_spec) = 0 or jsonb_array_length(v_spec) > 20 then
      raise exception 'KC_SEARCH_INVALID_GROUP:%', v_key;
    end if;
  end loop;

  for v_key, v_spec in select * from jsonb_each(coalesce(p_filters->'fields', '{}'::jsonb)) loop
    if not ((v_allowed_fields->p_module) ? v_key) or jsonb_typeof(v_spec) <> 'object' then
      raise exception 'KC_SEARCH_INVALID_FIELD:%', v_key;
    end if;
    v_op := v_spec->>'op';
    if v_key in ('preco','recompensa','contribuicao','vagas','orcamento','remuneracao') and v_op not in ('eq','gte','lte','range') then
      raise exception 'KC_SEARCH_INVALID_OPERATOR:%', v_key;
    elsif v_key = 'gratuito' and v_op <> 'eq' then raise exception 'KC_SEARCH_INVALID_OPERATOR:%', v_key;
    elsif v_key in ('marcadoresCarona','marcadoresMoradia') and v_op not in ('contains_any','contains_all') then raise exception 'KC_SEARCH_INVALID_OPERATOR:%', v_key;
    elsif v_key in ('data','data_fim','hora','horario') and v_op not in ('eq','gte','lte','range') then raise exception 'KC_SEARCH_INVALID_OPERATOR:%', v_key;
    elsif v_key not in ('preco','recompensa','contribuicao','vagas','orcamento','remuneracao','gratuito','marcadoresCarona','marcadoresMoradia','data','data_fim','hora','horario')
      and v_op not in ('eq','in','contains') then raise exception 'KC_SEARCH_INVALID_OPERATOR:%', v_key;
    end if;
  end loop;

  if coalesce(array_length(p_terms, 1), 0) > 24 or exists (select 1 from unnest(coalesce(p_terms, array[]::text[])) term where length(term) > 64) then
    raise exception 'KC_SEARCH_INVALID_TERMS';
  end if;
  v_terms := array(select distinct lower(btrim(public.kc_unaccent(term)))
    from unnest(coalesce(p_terms, array[p_q])) term where coalesce(btrim(term), '') <> '');
  select to_tsquery('portuguese', string_agg('(' || plainto_tsquery('portuguese', term)::text || ')', ' | '))
    into v_query from unnest(v_terms) term;

  return query
  with ranked as (
    select p.*, public.kc_posts_search_document(p.title, p.description, p.category, p.metadata) doc,
      lower(public.kc_unaccent(concat_ws(' ', p.title, p.module, p.category,
        public.kc_posts_search_subcategory(p.metadata), public.kc_posts_search_tags_text(p.metadata)))) fuzzy_text
    from public.posts p
    where p.legacy_id is null
      and (p_module is null or lower(p.module) = lower(p_module))
      and (p_category is null or lower(public.kc_unaccent(p.category)) = lower(public.kc_unaccent(p_category)))
      and (p_subcategory is null or lower(public.kc_unaccent(public.kc_posts_search_subcategory(p.metadata))) = lower(public.kc_unaccent(p_subcategory)))
      and not exists (
        select 1 from jsonb_each(coalesce(p_filters->'groups', '{}'::jsonb)) g
        where not exists (
          select 1 from jsonb_array_elements_text(g.value) wanted
          where lower(wanted) = any(case
            when g.key in ('status','categoria','topico') or (g.key = 'tipo' and p.module in ('caronas','moradia','oportunidades'))
              then array[lower(coalesce(p.category,''))]
            else array(select lower(value) from jsonb_array_elements_text(coalesce(p.metadata->'tagKeys','[]'::jsonb)) value)
          end)
        )
      )
      and not exists (
        select 1 from jsonb_each(coalesce(p_filters->'fields', '{}'::jsonb)) f
        where not (
          case
            when f.key in ('preco','recompensa','contribuicao','vagas','orcamento','remuneracao') then
              case f.value->>'op'
                when 'eq' then public.kc_safe_numeric(case when f.key='preco' then to_jsonb(p.price) else p.metadata->f.key end) = public.kc_safe_numeric(f.value->'value')
                when 'gte' then public.kc_safe_numeric(case when f.key='preco' then to_jsonb(p.price) else p.metadata->f.key end) >= public.kc_safe_numeric(f.value->'value')
                when 'lte' then public.kc_safe_numeric(case when f.key='preco' then to_jsonb(p.price) else p.metadata->f.key end) <= public.kc_safe_numeric(f.value->'value')
                when 'range' then public.kc_safe_numeric(case when f.key='preco' then to_jsonb(p.price) else p.metadata->f.key end)
                  between public.kc_safe_numeric(f.value->'value'->0) and public.kc_safe_numeric(f.value->'value'->1)
              end
            when f.key = 'gratuito' then coalesce((p.metadata->>'gratuito')::boolean,false) = (f.value->>'value')::boolean
            when f.key in ('marcadoresCarona','marcadoresMoradia') then
              case f.value->>'op'
                when 'contains_any' then exists (select 1 from jsonb_array_elements_text(coalesce(p.metadata->f.key,'[]'::jsonb)) actual
                  where actual in (select jsonb_array_elements_text(f.value->'value')))
                when 'contains_all' then not exists (select 1 from jsonb_array_elements_text(f.value->'value') wanted
                  where wanted not in (select jsonb_array_elements_text(coalesce(p.metadata->f.key,'[]'::jsonb))))
              end
            when f.key in ('data','data_fim','hora','horario') then
              case f.value->>'op'
                when 'eq' then coalesce(p.metadata->>f.key,'') = f.value->>'value'
                when 'gte' then coalesce(p.metadata->>f.key,'') >= f.value->>'value'
                when 'lte' then coalesce(p.metadata->>f.key,'') <= f.value->>'value'
                when 'range' then coalesce(p.metadata->>f.key,'') between f.value->'value'->>0 and f.value->'value'->>1
              end
            else
              case f.value->>'op'
                when 'eq' then lower(coalesce(case when f.key='localizacao' then p.location else p.metadata->>f.key end,'')) = lower(f.value->>'value')
                when 'contains' then lower(coalesce(case when f.key='localizacao' then p.location else p.metadata->>f.key end,'')) like '%'||lower(f.value->>'value')||'%'
                when 'in' then lower(coalesce(case when f.key='localizacao' then p.location else p.metadata->>f.key end,'')) in
                  (select lower(jsonb_array_elements_text(f.value->'value')))
              end
          end
        )
      )
  ), matched as (
    select ranked.*, ranked.doc @@ v_query is_fts, ts_rank_cd(ranked.doc, v_query) search_rank,
      (select coalesce(max(public.word_similarity(term, ranked.fuzzy_text)),0) from unnest(v_terms) term where length(term)>=4) fuzzy_sim
    from ranked
    where ranked.doc @@ v_query or exists (
      select 1 from unnest(v_terms) term where length(term)>=4 and public.word_similarity(term, ranked.fuzzy_text)>=0.5
    )
  )
  select jsonb_build_object('id',id,'author_id',author_id,'title',title,'module',module,
    'category',category,'status',status,'visibility',visibility,'metadata',metadata,'relevance_score',search_rank)
  from matched order by is_fts desc, search_rank desc, fuzzy_sim desc, created_at desc, id desc limit v_limit;
end
$$;

revoke all on function public.kc_search_posts_structured_v1(text,text[],text,text,text,jsonb,integer) from public;
grant execute on function public.kc_search_posts_structured_v1(text,text[],text,text,text,jsonb,integer) to anon, authenticated;

create table proof.legacy_hash(value text not null);
insert into proof.legacy_hash select md5(pg_get_functiondef(oid)) from pg_proc
  where oid='public.kc_search_posts_fts(text,text[],text,text,text,integer)'::regprocedure;

insert into public.profiles(id,is_admin) values
  ('00000000-0000-0000-0000-000000000001',false),
  ('00000000-0000-0000-0000-000000000002',false),
  ('00000000-0000-0000-0000-000000000003',true);

insert into public.posts(id,author_id,title,description,module,category,status,visibility,metadata,price,location,created_at) values
  ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Prova evento público','Campus acadêmico','eventos','academicos','published','public','{"gratuito":true,"data":"2026-06-21","hora":"19:00","tagKeys":["academicos"]}',0,'Samambaia',now()),
  ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Prova evento comunidade','Campus cultural','eventos','culturais','published','community','{"gratuito":false,"data":"2026-06-22","hora":"20:00","tagKeys":["culturais"]}',25,'Colemar',now()),
  ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Prova pendente','Campus','eventos','academicos','pending','public','{"gratuito":true,"tagKeys":["academicos"]}',0,'Samambaia',now()),
  ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','Prova oculta do autor','Campus','moradia','quartos','hidden','community','{"regiao":"samambaia","marcadoresMoradia":["mobiliado"]}',800,'Samambaia',now()),
  ('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000002','Prova oculta terceiro','Campus','oportunidades','estagios','hidden','community','{"modalidadeTrabalho":"remoto","remuneracao":1500}',null,'Goiânia',now()),
  ('10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000001','Prova moradia mobiliada','Campus','moradia','quartos','published','public','{"regiao":"samambaia","marcadoresMoradia":["mobiliado","internet"]}',850,'Campus Samambaia',now()),
  ('10000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000002','Prova oportunidade remota','Campus','oportunidades','estagios','published','public','{"modalidadeTrabalho":"remoto","regimeContratacao":"bolsa","remuneracao":1800,"areaAtuacao":"tecnologia"}',null,'Goiânia',now()),
  ('10000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000001','Prova carona noturna','Campus','caronas','ofereco','published','public','{"origem":"samambaia","destino":"centro","horario":"20:30","vagas":3,"contribuicao":8,"marcadoresCarona":["noturna","acessivel"]}',null,'Goiânia',now()),
  ('10000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000002','Prova livro usado','Campus','compra-venda','livros','published','public','{"condicao":"usado"}',45,'Setor Universitário',now()),
  ('10000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','Prova item perdido','Campus','achados-perdidos','perdidos','published','public','{"entrega":"presencial","recompensa":20}',null,'Biblioteca Central',now());

create table proof.rls_results(actor text, case_name text, direct_count integer, legacy_count integer, candidate_count integer);

create or replace procedure proof.capture_case(p_actor text, p_case text, p_id uuid)
language plpgsql security invoker set search_path = '' as $$
begin
  insert into proof.rls_results
  select p_actor,p_case,
    (select count(*) from public.posts where id=p_id),
    (select count(*) from public.kc_search_posts_fts('prova',array['prova'],null,null,null,50) r where (r->>'id')::uuid=p_id),
    (select count(*) from public.kc_search_posts_structured_v1('prova',array['prova'],null,null,null,'{}',50) r where (r->>'id')::uuid=p_id);
end
$$;
grant insert,select on proof.rls_results to anon,authenticated;
grant usage on schema proof to anon,authenticated;
grant execute on procedure proof.capture_case(text,text,uuid) to anon,authenticated;

set role anon;
select set_config('request.jwt.claim.role','anon',false);
select set_config('request.jwt.claim.sub','',false);
call proof.capture_case('anon','published-public','10000000-0000-0000-0000-000000000001');
call proof.capture_case('anon','published-community','10000000-0000-0000-0000-000000000002');
call proof.capture_case('anon','pending-public','10000000-0000-0000-0000-000000000003');
reset role;

set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
call proof.capture_case('authenticated-third','published-public','10000000-0000-0000-0000-000000000001');
call proof.capture_case('authenticated-third','published-community','10000000-0000-0000-0000-000000000002');
call proof.capture_case('authenticated-third','hidden-third','10000000-0000-0000-0000-000000000004');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
call proof.capture_case('author','own-hidden-community','10000000-0000-0000-0000-000000000004');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
call proof.capture_case('admin','hidden-third','10000000-0000-0000-0000-000000000005');
reset role;

do $$
declare failures integer;
begin
  select count(*) into failures from proof.rls_results where direct_count<>legacy_count or direct_count<>candidate_count;
  if failures<>0 then raise exception 'KC_PROOF_RLS_PARITY_FAILURE:%',failures; end if;
  if (select direct_count from proof.rls_results where actor='anon' and case_name='published-public')<>1 then raise exception 'KC_PROOF_ANON_PUBLIC'; end if;
  if exists(select 1 from proof.rls_results where actor='anon' and case_name<>'published-public' and direct_count<>0) then raise exception 'KC_PROOF_ANON_LEAK'; end if;
  if (select direct_count from proof.rls_results where actor='author')<>1 then raise exception 'KC_PROOF_AUTHOR'; end if;
  if (select direct_count from proof.rls_results where actor='admin')<>1 then raise exception 'KC_PROOF_ADMIN'; end if;
end
$$;

\echo 'KC_PROOF phase=rls-matrix'
table proof.rls_results;

\echo 'KC_PROOF phase=input-validation expected-errors=6'
do $$
declare passed integer:=0;
begin
  begin perform public.kc_search_posts_structured_v1(repeat('x',161),null,null,null,null,'{}',50); exception when others then passed:=passed+1; end;
  begin perform public.kc_search_posts_structured_v1('prova',null,'invalido',null,null,'{}',50); exception when others then passed:=passed+1; end;
  begin perform public.kc_search_posts_structured_v1('prova',null,null,null,null,'{"groups":{"tipo":["x"]}}',50); exception when others then passed:=passed+1; end;
  begin perform public.kc_search_posts_structured_v1('prova',null,'eventos',null,null,'{"fields":{"contato":{"op":"eq","value":"x"}}}',50); exception when others then passed:=passed+1; end;
  begin perform public.kc_search_posts_structured_v1('prova',null,'eventos',null,null,'{"fields":{"gratuito":{"op":"contains","value":true}}}',50); exception when others then passed:=passed+1; end;
  begin perform public.kc_search_posts_structured_v1('prova',array_fill('x'::text,array[25]),'eventos',null,null,'{}',50); exception when others then passed:=passed+1; end;
  if passed<>6 then raise exception 'KC_PROOF_VALIDATION_FAILURE:%',passed; end if;
  raise notice 'KC_PROOF validation_passed=%',passed;
end
$$;

do $$
declare n integer;
begin
  select count(*) into n from public.kc_search_posts_structured_v1('prova',array['prova'],'eventos',null,null,
    '{"groups":{"topico":["academicos"]},"fields":{"gratuito":{"op":"eq","value":true},"preco":{"op":"lte","value":0},"data":{"op":"range","value":["2026-06-20","2026-06-21"]}}}',50);
  if n<>1 then raise exception 'KC_PROOF_STRUCTURED_FILTER_FAILURE:%',n; end if;
  select count(*) into n from public.kc_search_posts_structured_v1('pova',array['pova'],'eventos',null,null,'{}',50);
  if n<1 then raise exception 'KC_PROOF_TYPO_FAILURE'; end if;
  select count(*) into n from public.kc_search_posts_structured_v1('publico',array['publico'],'eventos',null,null,'{}',50) r
    where r->>'id'='10000000-0000-0000-0000-000000000001';
  if n<>1 then raise exception 'KC_PROOF_ACCENT_FAILURE'; end if;

  select count(*) into n from public.kc_search_posts_structured_v1('prova',array['prova'],'moradia',null,null,
    '{"groups":{"tipo":["quartos"]},"fields":{"marcadoresMoradia":{"op":"contains_all","value":["mobiliado","internet"]},"preco":{"op":"range","value":[800,900]},"localizacao":{"op":"contains","value":"samambaia"}}}',50);
  if n<>1 then raise exception 'KC_PROOF_MORADIA_FILTER_CLASS:%',n; end if;
  select count(*) into n from public.kc_search_posts_structured_v1('prova',array['prova'],'oportunidades',null,null,
    '{"groups":{"tipo":["estagios"]},"fields":{"modalidadeTrabalho":{"op":"eq","value":"remoto"},"regimeContratacao":{"op":"in","value":["bolsa"]},"remuneracao":{"op":"gte","value":1700}}}',50);
  if n<>1 then raise exception 'KC_PROOF_OPORTUNIDADE_FILTER_CLASS:%',n; end if;
  select count(*) into n from public.kc_search_posts_structured_v1('prova',array['prova'],'caronas',null,null,
    '{"groups":{"tipo":["ofereco"]},"fields":{"marcadoresCarona":{"op":"contains_any","value":["noturna"]},"vagas":{"op":"gte","value":2},"horario":{"op":"range","value":["20:00","21:00"]}}}',50);
  if n<>1 then raise exception 'KC_PROOF_CARONA_FILTER_CLASS:%',n; end if;
  select count(*) into n from public.kc_search_posts_structured_v1('prova',array['prova'],'compra-venda',null,null,
    '{"groups":{"categoria":["livros"]},"fields":{"condicao":{"op":"in","value":["usado"]},"preco":{"op":"lte","value":50},"localizacao":{"op":"contains","value":"universitário"}}}',50);
  if n<>1 then raise exception 'KC_PROOF_COMPRA_FILTER_CLASS:%',n; end if;
  select count(*) into n from public.kc_search_posts_structured_v1('prova',array['prova'],'achados-perdidos',null,null,
    '{"groups":{"status":["perdidos"]},"fields":{"entrega":{"op":"eq","value":"presencial"},"recompensa":{"op":"gte","value":10},"localizacao":{"op":"contains","value":"biblioteca"}}}',50);
  if n<>1 then raise exception 'KC_PROOF_ACHADOS_FILTER_CLASS:%',n; end if;
  raise notice 'KC_PROOF structured_filter_classes=pass typo=pass accent=pass';
end
$$;

\echo 'KC_PROOF phase=synthetic-10k'
insert into public.posts(id,author_id,title,description,module,category,status,visibility,metadata,price,location,created_at)
select md5('synthetic-'||i)::uuid,
  case when i%2=0 then '00000000-0000-0000-0000-000000000001'::uuid else '00000000-0000-0000-0000-000000000002'::uuid end,
  'Campus item sintético '||i, 'Descrição pública sintética sem dado real',
  (array['eventos','oportunidades','moradia','compra-venda','caronas','achados-perdidos'])[(i%6)+1],
  case (i%6) when 0 then (array['academicos','culturais','esportivos'])[(i%3)+1]
    when 1 then (array['estagios','empregos','pesquisa'])[(i%3)+1]
    when 2 then (array['quartos','casas','republicas'])[(i%3)+1]
    when 3 then (array['livros','eletronicos','moveis'])[(i%3)+1]
    when 4 then (array['ofereco','procuro'])[(i%2)+1]
    else (array['perdidos','encontrados'])[(i%2)+1] end,
  'published','public',jsonb_build_object('gratuito',i%2=0,'preco',i%1000,'data','2026-06-21','tagKeys',jsonb_build_array('academicos')),
  i%1000,'Campus Samambaia',now()-(i||' seconds')::interval
from generate_series(1,9990) i;
analyze public.posts;

create table proof.metrics(dataset text,rpc text,elapsed_ms numeric);
do $$
declare i integer; started timestamptz;
begin
  for i in 1..5 loop
    started:=clock_timestamp(); perform count(*) from public.kc_search_posts_fts('campus',array['campus'],'eventos','academicos',null,50);
    insert into proof.metrics values('10k','legacy',extract(epoch from clock_timestamp()-started)*1000);
    started:=clock_timestamp(); perform count(*) from public.kc_search_posts_structured_v1('campus',array['campus'],'eventos','academicos',null,'{}',50);
    insert into proof.metrics values('10k','candidate',extract(epoch from clock_timestamp()-started)*1000);
  end loop;
end
$$;

\echo 'KC_PROOF phase=synthetic-50k'
insert into public.posts(id,author_id,title,description,module,category,status,visibility,metadata,price,location,created_at)
select md5('synthetic-'||i)::uuid,'00000000-0000-0000-0000-000000000002'::uuid,
  'Campus item sintético '||i,'Descrição pública sintética sem dado real',
  (array['eventos','oportunidades','moradia','compra-venda','caronas','achados-perdidos'])[(i%6)+1],
  case (i%6) when 0 then (array['academicos','culturais','esportivos'])[(i%3)+1]
    when 1 then (array['estagios','empregos','pesquisa'])[(i%3)+1]
    when 2 then (array['quartos','casas','republicas'])[(i%3)+1]
    when 3 then (array['livros','eletronicos','moveis'])[(i%3)+1]
    when 4 then (array['ofereco','procuro'])[(i%2)+1]
    else (array['perdidos','encontrados'])[(i%2)+1] end,
  'published','public',jsonb_build_object('gratuito',i%2=0,'preco',i%1000,'data','2026-06-21','tagKeys',jsonb_build_array('academicos')),
  i%1000,'Campus Samambaia',now()-(i||' seconds')::interval
from generate_series(9996,49995) i;
analyze public.posts;

\echo 'KC_PROOF phase=strict-timeout-gate expected=timeout'
\set ON_ERROR_STOP off
set statement_timeout = '1500ms';
select count(*) from public.kc_search_posts_structured_v1(
  'campus',array['campus'],'eventos','academicos',null,'{}',50
);
\if :ERROR
  \echo 'KC_PROOF strict_timeout_1500ms=failed-as-expected migration_gate=not-met'
\else
  \echo 'KC_PROOF strict_timeout_1500ms=unexpected-pass'
  \quit 3
\endif
\set ON_ERROR_STOP on
set statement_timeout = '60s';

do $$
declare i integer; started timestamptz;
begin
  for i in 1..5 loop
    started:=clock_timestamp(); perform count(*) from public.kc_search_posts_fts('campus',array['campus'],'eventos','academicos',null,50);
    insert into proof.metrics values('50k','legacy',extract(epoch from clock_timestamp()-started)*1000);
    started:=clock_timestamp(); perform count(*) from public.kc_search_posts_structured_v1('campus',array['campus'],'eventos','academicos',null,'{}',50);
    insert into proof.metrics values('50k','candidate',extract(epoch from clock_timestamp()-started)*1000);
  end loop;
end
$$;

\echo 'KC_PROOF phase=metrics-before-index'
select dataset,rpc,round(percentile_cont(.5) within group(order by elapsed_ms)::numeric,3) p50_ms,
  round(percentile_cont(.95) within group(order by elapsed_ms)::numeric,3) p95_ms,
  round(max(elapsed_ms),3) max_ms from proof.metrics group by dataset,rpc order by dataset,rpc;

do $$
declare v_dataset text; v_legacy numeric; v_candidate numeric;
begin
  for v_dataset in select distinct dataset from proof.metrics loop
    select percentile_cont(.95) within group(order by elapsed_ms) into v_legacy
      from proof.metrics where dataset=v_dataset and rpc='legacy';
    select percentile_cont(.95) within group(order by elapsed_ms) into v_candidate
      from proof.metrics where dataset=v_dataset and rpc='candidate';
    if v_candidate > v_legacy * 1.20 then
      raise exception 'KC_PROOF_PERFORMANCE_REGRESSION dataset=% legacy_p95=% candidate_p95=%',v_dataset,v_legacy,v_candidate;
    end if;
  end loop;
  raise notice 'KC_PROOF performance_no_filter_p95_regression_lte_20pct=pass';
end
$$;

\echo 'KC_PROOF phase=explain-before-index'
explain(analyze,buffers,format json)
select * from public.kc_search_posts_structured_v1('campus',array['campus'],'eventos','academicos',null,
  '{"groups":{"topico":["academicos"]}}',50);
explain(analyze,buffers,format json)
select count(*) from public.posts p
where p.legacy_id is null and p.module='eventos' and p.category='academicos'
  and public.kc_posts_search_document(p.title,p.description,p.category,p.metadata)
    @@ plainto_tsquery('portuguese',public.kc_unaccent('campus'));

\echo 'KC_PROOF phase=candidate-index'
create index idx_posts_search_module_category_candidate on public.posts(module,category) where legacy_id is null;
analyze public.posts;
select pg_size_pretty(pg_relation_size('public.idx_posts_search_module_category_candidate')) candidate_index_size;
explain(analyze,buffers,format json)
select * from public.kc_search_posts_structured_v1('campus',array['campus'],'eventos','academicos',null,
  '{"groups":{"topico":["academicos"]}}',50);
explain(analyze,buffers,format json)
select count(*) from public.posts p
where p.legacy_id is null and p.module='eventos' and p.category='academicos'
  and public.kc_posts_search_document(p.title,p.description,p.category,p.metadata)
    @@ plainto_tsquery('portuguese',public.kc_unaccent('campus'));

\echo 'KC_PROOF phase=catalog'
select n.nspname,p.proname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner,
  coalesce(array_to_string(p.proacl,','),'') acl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.oid in ('public.kc_search_posts_fts(text,text[],text,text,text,integer)'::regprocedure,
  'public.kc_search_posts_structured_v1(text,text[],text,text,text,jsonb,integer)'::regprocedure)
order by p.proname;
select relrowsecurity,relforcerowsecurity from pg_class where oid='public.posts'::regclass;
select polname,polroles::regrole[] from pg_policy where polrelid='public.posts'::regclass order by polname;

do $$
declare v_oid oid := 'public.kc_search_posts_structured_v1(text,text[],text,text,text,jsonb,integer)'::regprocedure;
begin
  if (select prosecdef from pg_proc where oid=v_oid) then raise exception 'KC_PROOF_CANDIDATE_NOT_INVOKER'; end if;
  if not (select 'search_path=""'=any(proconfig) from pg_proc where oid=v_oid) then raise exception 'KC_PROOF_SEARCH_PATH_NOT_EMPTY'; end if;
  if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where p.oid=v_oid and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'KC_PROOF_PUBLIC_EXECUTE'; end if;
  if not has_function_privilege('anon',v_oid,'EXECUTE') or not has_function_privilege('authenticated',v_oid,'EXECUTE') then
    raise exception 'KC_PROOF_REQUIRED_EXECUTE_MISSING';
  end if;
  raise notice 'KC_PROOF catalog_invoker_empty_search_path_explicit_grants=pass';
end
$$;

\echo 'KC_PROOF phase=rollback-r3'
revoke execute on function public.kc_search_posts_structured_v1(text,text[],text,text,text,jsonb,integer) from anon,authenticated;
drop function public.kc_search_posts_structured_v1(text,text[],text,text,text,jsonb,integer);
drop index public.idx_posts_search_module_category_candidate;

do $$
begin
  if to_regprocedure('public.kc_search_posts_structured_v1(text,text[],text,text,text,jsonb,integer)') is not null then raise exception 'KC_PROOF_ROLLBACK_CANDIDATE_EXISTS'; end if;
  if to_regclass('public.idx_posts_search_module_category_candidate') is not null then raise exception 'KC_PROOF_ROLLBACK_INDEX_EXISTS'; end if;
  if (select md5(pg_get_functiondef(oid)) from pg_proc where oid='public.kc_search_posts_fts(text,text[],text,text,text,integer)'::regprocedure)
    <> (select value from proof.legacy_hash) then raise exception 'KC_PROOF_ROLLBACK_LEGACY_CHANGED'; end if;
  raise notice 'KC_PROOF rollback_r3=pass legacy_hash_preserved=true candidate_absent=true index_absent=true';
end
$$;

set role anon;
select set_config('request.jwt.claim.role','anon',false);
select set_config('request.jwt.claim.sub','',false);
select count(*) direct_public_after_rollback from public.posts where id='10000000-0000-0000-0000-000000000001';
select count(*) legacy_public_after_rollback from public.kc_search_posts_fts('prova',array['prova'],null,null,null,50)
  as result(value) where value->>'id'='10000000-0000-0000-0000-000000000001';
reset role;

\echo 'KC_PROOF result=pass candidate_migration_authorized=false reason=repository-migration-chain-invalid'
