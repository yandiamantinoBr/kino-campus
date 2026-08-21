-- User-managed post tags are deliberately separate from the automatic
-- taxonomy (`tags` / `tagKeys`). Existing taxonomy can exceed 12 entries and
-- must remain untouched by this contract.

begin;

create or replace function public.kc_normalize_post_user_tags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.metadata, '{}'::jsonb);
  v_old_meta jsonb := '{}'::jsonb;
  v_item jsonb;
  v_label text;
  v_key text;
  v_tags text[] := array[]::text[];
  v_tag_keys text[] := array[]::text[];
  v_seen jsonb := '{}'::jsonb;
  v_limit integer := 6;
  v_privileged boolean := false;
begin
  if jsonb_typeof(v_meta) <> 'object' then
    raise exception 'post_user_tags_metadata_must_be_object'
      using errcode = '22023', hint = 'metadata precisa ser um objeto JSON.';
  end if;

  -- A maioria das APIs atualiza metadata parcialmente. Ausência de userTags
  -- não é uma exclusão ativa; uma limpeza explícita usa userTags: [].
  if tg_op = 'UPDATE' then
    v_old_meta := coalesce(old.metadata, '{}'::jsonb);
    if jsonb_typeof(v_old_meta) <> 'object' then v_old_meta := '{}'::jsonb; end if;
    if not (v_meta ? 'userTags') and v_old_meta ? 'userTags' then
      v_meta := jsonb_set(v_meta, '{userTags}', v_old_meta->'userTags', true);
      if v_old_meta ? 'userTagKeys' then
        v_meta := jsonb_set(v_meta, '{userTagKeys}', v_old_meta->'userTagKeys', true);
      end if;
    end if;
  end if;

  if not (v_meta ? 'userTags') then
    if v_meta ? 'userTagKeys' then
      raise exception 'post_user_tag_keys_require_user_tags'
        using errcode = '22023', hint = 'Envie userTags; userTagKeys é derivado no servidor.';
    end if;
    new.metadata := v_meta;
    return new;
  end if;

  if jsonb_typeof(v_meta->'userTags') <> 'array' then
    raise exception 'post_user_tags_must_be_array'
      using errcode = '22023', hint = 'userTags precisa ser uma lista de textos.';
  end if;

  v_privileged := coalesce(auth.role(), '') = 'service_role'
    or public.kc_is_admin(auth.uid());
  if not v_privileged and new.author_id is not null then
    -- The private helper is intentionally service-only. This SECURITY DEFINER
    -- trigger can safely use it while still deriving the role from the caller.
    v_privileged := coalesce(kc_private.kc_is_trusted_publisher(new.author_id), false);
  end if;
  v_limit := case when v_privileged then 12 else 6 end;

  for v_item in select value from jsonb_array_elements(v_meta->'userTags') as value loop
    if jsonb_typeof(v_item) <> 'string' then
      raise exception 'post_user_tag_must_be_text'
        using errcode = '22023', hint = 'Cada tag precisa ser um texto.';
    end if;

    v_label := regexp_replace(btrim(v_item #>> '{}'), '\s+', ' ', 'g');
    if v_label = '' then continue; end if;
    if char_length(v_label) > 60 then
      raise exception 'post_user_tag_too_long'
        using errcode = '22023', hint = 'Cada tag pode ter no máximo 60 caracteres.';
    end if;

    v_key := regexp_replace(
      regexp_replace(lower(public.kc_unaccent(v_label)), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'
    );
    if v_key = '' then
      raise exception 'post_user_tag_invalid'
        using errcode = '22023', hint = 'Use ao menos uma letra ou número em cada tag.';
    end if;
    v_key := left(v_key, 60);

    if not (v_seen ? v_key) then
      v_seen := v_seen || jsonb_build_object(v_key, true);
      v_tags := array_append(v_tags, v_label);
      v_tag_keys := array_append(v_tag_keys, v_key);
    end if;
  end loop;

  if cardinality(v_tags) > v_limit then
    raise exception 'post_user_tag_limit_exceeded'
      using errcode = '22023',
            detail = format('received=%s limit=%s', cardinality(v_tags), v_limit),
            hint = format('O limite é de %s tags adicionais para este autor.', v_limit);
  end if;

  -- Ignore a caller-supplied key list: it is always derived from the visible
  -- labels so filtering, FTS and the UI share a stable canonical key.
  v_meta := jsonb_set(v_meta, '{userTags}', to_jsonb(v_tags), true);
  v_meta := jsonb_set(v_meta, '{userTagKeys}', to_jsonb(v_tag_keys), true);
  new.metadata := v_meta;
  return new;
end;
$$;

drop trigger if exists trg_posts_user_tags_contract on public.posts;
create trigger trg_posts_user_tags_contract
before insert or update of metadata on public.posts
for each row execute function public.kc_normalize_post_user_tags();

comment on function public.kc_normalize_post_user_tags() is
  'Normalizes metadata.userTags/userTagKeys, preserves omitted values on partial edits and enforces 6 regular or 12 privileged additional tags.';

-- Full-text search uses kc_posts_search_tags_text inside idx_posts_fts.
create or replace function public.kc_posts_search_tags_text(p_metadata jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(both ' ' from concat_ws(
    ' ',
    coalesce((
      select string_agg(value, ' ')
      from jsonb_array_elements_text(coalesce(coalesce(p_metadata, '{}'::jsonb)->'tags', '[]'::jsonb)) as value
    ), ''),
    coalesce((
      select string_agg(value, ' ')
      from jsonb_array_elements_text(coalesce(coalesce(p_metadata, '{}'::jsonb)->'tagKeys', '[]'::jsonb)) as value
    ), ''),
    coalesce((
      select string_agg(value, ' ')
      from jsonb_array_elements_text(coalesce(coalesce(p_metadata, '{}'::jsonb)->'userTags', '[]'::jsonb)) as value
    ), ''),
    coalesce((
      select string_agg(value, ' ')
      from jsonb_array_elements_text(coalesce(coalesce(p_metadata, '{}'::jsonb)->'userTagKeys', '[]'::jsonb)) as value
    ), '')
  ))
$$;

-- Browser-equivalent remote search has a separate pg_trgm expression index.
create or replace function public.kc_posts_feed_metadata_search_text(p_metadata jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(concat_ws(
    ' ',
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'categoria'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'category'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'categoriaLabel'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'categoryLabel'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'subcategoria'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'subcategory'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'subcategoriaLabel'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'subcategoryLabel'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'localizacao'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'location'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'condicao'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'origem'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'destino'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'horario'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'area'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'areaLabel'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'workMode'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'workModeLabel'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'modalidadeTrabalho'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'regimeContratacao'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'employmentType'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'employmentTypeLabel'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'tags'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'tagKeys'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'userTags'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'userTagKeys'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'housingFeatureLabels'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'housingFeatureKeys'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'caronasFeatureLabels'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'caronasFeatureKeys'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'features'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'marcadoresMoradia'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'marcadoresCarona')
  ));
$$;

-- Replacing an IMMUTABLE function does not refresh its functional indexes.
-- The table is currently small and the non-concurrent rebuild is atomic with
-- this migration, so queries cannot observe a stale expression.
reindex index public.idx_posts_fts;
reindex index public.idx_posts_feed_cursor_search_trgm;

-- The current cursor function is long and contains pagination/lifecycle rules
-- that must remain byte-for-byte intact. Patch only the canonical p_tag
-- predicate from the immediately preceding migration, failing closed if its
-- expected source is not present.
do $$
declare
  v_function regprocedure := 'public.kc_get_feed_cursor(text,text[],text,text,text,text,text,integer,text,jsonb)'::regprocedure;
  v_definition text;
  v_old_clause text := $clause$
        p_tag is null
        or coalesce(p.metadata->'tagKeys', '[]'::jsonb) @> jsonb_build_array(lower(p_tag))
$clause$;
  v_new_clause text := $clause$
        p_tag is null
        or (
          coalesce(p.metadata->'tagKeys', '[]'::jsonb) @> jsonb_build_array(lower(p_tag))
          or coalesce(p.metadata->'userTagKeys', '[]'::jsonb) @> jsonb_build_array(lower(p_tag))
        )
$clause$;
begin
  select pg_get_functiondef(v_function) into v_definition;
  if position(v_old_clause in v_definition) = 0 then
    raise exception 'kc_get_feed_cursor_tag_clause_not_found'
      using hint = 'A migração requer a versão de kc_get_feed_cursor definida em 20260810124931_feed_hide_closed_cursor_filter.sql.';
  end if;
  execute replace(v_definition, v_old_clause, v_new_clause);
end;
$$;

comment on function public.kc_posts_feed_metadata_search_text(jsonb) is
  'Allowlisted public metadata values mirrored from the browser feed search haystack, including user-managed additional tags.';
comment on function public.kc_posts_search_tags_text(jsonb) is
  'Search text for automatic taxonomy and user-managed additional post tags.';

commit;
