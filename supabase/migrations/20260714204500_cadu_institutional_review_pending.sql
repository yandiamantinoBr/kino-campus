begin;

-- Institutional-source review is editorial catalog state, not a feed post.
-- Keeping it out of public.posts separates content identity/deduplication and
-- the publication flood gate by construction.
create table if not exists public.cadu_institutional_source_reviews (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  source_id text not null,
  source_url text not null,
  content_url text not null,
  instagram_handle text,
  content_kind text not null default 'institutional_site',
  intent text not null default 'review',
  idempotency_key text not null,
  source_revision text not null,
  registry_sha256 text not null,
  name text not null,
  note text,
  tier smallint,
  category text not null,
  origin text not null default 'cadu-admin-map-ufg',
  state text not null default 'pending',
  resolved_by uuid references public.profiles(id) on delete restrict,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cadu_institutional_source_reviews_source_id_check
    check (source_id ~ '^web[.][a-z0-9][a-z0-9.-]{0,115}$'),
  constraint cadu_institutional_source_reviews_urls_check
    check (
      source_url ~ '^https://[^[:space:]]+$'
      and content_url = source_url
      and length(source_url) <= 500
    ),
  constraint cadu_institutional_source_reviews_instagram_check
    check (
      instagram_handle is null
      or instagram_handle ~ '^[a-z0-9._]{1,30}$'
    ),
  constraint cadu_institutional_source_reviews_contract_check
    check (
      content_kind = 'institutional_site'
      and intent = 'review'
      and origin = 'cadu-admin-map-ufg'
      and source_revision ~ '^[a-f0-9]{64}$'
      and registry_sha256 ~ '^[a-f0-9]{64}$'
      and idempotency_key =
        'map-ufg-review:' || source_id || ':' || source_revision
      and length(name) between 2 and 200
      and name !~ '[[:cntrl:]]'
      and (note is null or (length(note) <= 500 and note !~ '[[:cntrl:]]'))
      and (tier is null or tier between 1 and 3)
      and length(category) between 1 and 80
      and category !~ '[[:cntrl:]]'
    ),
  constraint cadu_institutional_source_reviews_state_check
    check (
      state in ('pending', 'approved', 'rejected', 'superseded')
      and (
        (
          state = 'pending'
          and resolved_by is null
          and resolved_at is null
          and resolution_note is null
        )
        or (
          state <> 'pending'
          and resolved_by is not null
          and resolved_at is not null
          and (resolution_note is null or length(resolution_note) <= 1000)
        )
      )
    )
);

comment on table public.cadu_institutional_source_reviews is
  'Fila editorial tipada do Mapa UFG. Nunca é uma publicação do feed e não participa do flood/dedup de posts.';

create unique index if not exists cadu_institutional_reviews_idempotency_uq
  on public.cadu_institutional_source_reviews (idempotency_key);

create unique index if not exists cadu_institutional_reviews_source_revision_uq
  on public.cadu_institutional_source_reviews (source_id, source_revision);

create unique index if not exists cadu_institutional_reviews_one_pending_source_uq
  on public.cadu_institutional_source_reviews (source_id)
  where state = 'pending';

create index if not exists cadu_institutional_reviews_state_created_idx
  on public.cadu_institutional_source_reviews (state, created_at desc);

create index if not exists cadu_institutional_reviews_requester_created_idx
  on public.cadu_institutional_source_reviews (requested_by, created_at desc);

alter table public.cadu_institutional_source_reviews enable row level security;
revoke all on table public.cadu_institutional_source_reviews
  from public, anon, authenticated, service_role;

create or replace function kc_private.kc_guard_cadu_institutional_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.requested_by is distinct from old.requested_by
     or new.source_id is distinct from old.source_id
     or new.source_url is distinct from old.source_url
     or new.content_url is distinct from old.content_url
     or new.instagram_handle is distinct from old.instagram_handle
     or new.content_kind is distinct from old.content_kind
     or new.intent is distinct from old.intent
     or new.idempotency_key is distinct from old.idempotency_key
     or new.source_revision is distinct from old.source_revision
     or new.registry_sha256 is distinct from old.registry_sha256
     or new.name is distinct from old.name
     or new.note is distinct from old.note
     or new.tier is distinct from old.tier
     or new.category is distinct from old.category
     or new.origin is distinct from old.origin
     or new.created_at is distinct from old.created_at then
    raise exception 'cadu_review_envelope_is_immutable' using errcode = '23514';
  end if;

  if old.state <> 'pending' then
    if new is distinct from old then
      raise exception 'cadu_review_terminal_state_is_immutable'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.state = 'pending' then
    if new.resolved_by is not null
       or new.resolved_at is not null
       or new.resolution_note is not null then
      raise exception 'cadu_review_pending_resolution_is_invalid'
        using errcode = '23514';
    end if;
  elsif new.state not in ('approved', 'rejected', 'superseded')
        or new.resolved_by is null
        or new.resolved_at is null then
    raise exception 'cadu_review_resolution_is_invalid' using errcode = '23514';
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function kc_private.kc_guard_cadu_institutional_review()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_guard_cadu_institutional_review
  on public.cadu_institutional_source_reviews;
create trigger trg_guard_cadu_institutional_review
  before update on public.cadu_institutional_source_reviews
  for each row
  execute function kc_private.kc_guard_cadu_institutional_review();

create or replace function public.kc_create_institutional_source_review(
  p_requested_by uuid,
  p_source_id text,
  p_source_url text,
  p_content_url text,
  p_instagram_handle text,
  p_content_kind text,
  p_intent text,
  p_idempotency_key text,
  p_source_revision text,
  p_registry_sha256 text,
  p_name text,
  p_note text,
  p_tier smallint,
  p_category text,
  p_origin text
)
returns table (
  id uuid,
  requested_by uuid,
  source_id text,
  source_url text,
  content_url text,
  instagram_handle text,
  content_kind text,
  intent text,
  idempotency_key text,
  source_revision text,
  registry_sha256 text,
  name text,
  note text,
  tier smallint,
  category text,
  origin text,
  state text,
  created_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.cadu_institutional_source_reviews%rowtype;
  v_created public.cadu_institutional_source_reviews%rowtype;
  v_rate_count integer;
begin
  if p_requested_by is null or not exists (
    select 1
    from public.kc_trusted_publishers trusted
    where trusted.user_id = p_requested_by
  ) then
    raise exception 'cadu_review_requester_is_not_trusted'
      using errcode = '42501';
  end if;

  -- Serialize retries/source races without touching the publication flood.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cadu-review-key:' || p_idempotency_key, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cadu-review-source:' || p_source_id, 0)
  );

  select review.* into v_existing
  from public.cadu_institutional_source_reviews review
  where review.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.requested_by is distinct from p_requested_by
       or v_existing.source_id is distinct from p_source_id
       or v_existing.source_url is distinct from p_source_url
       or v_existing.content_url is distinct from p_content_url
       or v_existing.instagram_handle is distinct from p_instagram_handle
       or v_existing.content_kind is distinct from p_content_kind
       or v_existing.intent is distinct from p_intent
       or v_existing.source_revision is distinct from p_source_revision
       or v_existing.registry_sha256 is distinct from p_registry_sha256
       or v_existing.name is distinct from p_name
       or v_existing.note is distinct from p_note
       or v_existing.tier is distinct from p_tier
       or v_existing.category is distinct from p_category
       or v_existing.origin is distinct from p_origin then
      raise exception 'cadu_review_idempotency_conflict' using errcode = '23505';
    end if;
    if v_existing.state <> 'pending' then
      raise exception 'cadu_review_idempotency_is_terminal' using errcode = '23505';
    end if;
    return query select
      v_existing.id, v_existing.requested_by, v_existing.source_id,
      v_existing.source_url, v_existing.content_url,
      v_existing.instagram_handle, v_existing.content_kind,
      v_existing.intent, v_existing.idempotency_key,
      v_existing.source_revision, v_existing.registry_sha256,
      v_existing.name, v_existing.note, v_existing.tier,
      v_existing.category, v_existing.origin, v_existing.state,
      v_existing.created_at, true;
    return;
  end if;

  if exists (
    select 1
    from public.cadu_institutional_source_reviews review
    where review.source_id = p_source_id and review.state = 'pending'
  ) then
    raise exception 'cadu_review_source_already_pending' using errcode = '23505';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cadu-review-rate:' || p_requested_by::text, 0)
  );
  select count(*)::integer into v_rate_count
  from public.cadu_institutional_source_reviews review
  where review.requested_by = p_requested_by
    and review.created_at >= pg_catalog.clock_timestamp() - interval '1 hour';
  if v_rate_count >= 60 then
    raise exception 'cadu_review_rate_limit_exceeded' using errcode = 'P0001';
  end if;

  insert into public.cadu_institutional_source_reviews (
    requested_by, source_id, source_url, content_url, instagram_handle,
    content_kind, intent, idempotency_key, source_revision,
    registry_sha256, name, note, tier, category, origin
  ) values (
    p_requested_by, p_source_id, p_source_url, p_content_url,
    p_instagram_handle, p_content_kind, p_intent, p_idempotency_key,
    p_source_revision, p_registry_sha256, p_name, p_note, p_tier,
    p_category, p_origin
  ) returning * into v_created;

  insert into public.audit_log (
    action, entity_type, entity_id, actor_id, payload
  ) values (
    'cadu_institutional_source_review_requested',
    'cadu_institutional_source_reviews',
    v_created.id,
    p_requested_by,
    jsonb_build_object(
      'state', v_created.state,
      'source_id', v_created.source_id,
      'source_url', v_created.source_url,
      'content_url', v_created.content_url,
      'instagram_handle', v_created.instagram_handle,
      'source_revision', v_created.source_revision,
      'registry_sha256', v_created.registry_sha256,
      'idempotency_key', v_created.idempotency_key
    )
  );

  return query select
    v_created.id, v_created.requested_by, v_created.source_id,
    v_created.source_url, v_created.content_url,
    v_created.instagram_handle, v_created.content_kind,
    v_created.intent, v_created.idempotency_key,
    v_created.source_revision, v_created.registry_sha256,
    v_created.name, v_created.note, v_created.tier,
    v_created.category, v_created.origin, v_created.state,
    v_created.created_at, false;
end;
$$;

revoke all on function public.kc_create_institutional_source_review(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, smallint, text, text
) from public, anon, authenticated;
grant execute on function public.kc_create_institutional_source_review(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, smallint, text, text
) to service_role;

create or replace function public.kc_resolve_institutional_source_review(
  p_review_id uuid,
  p_expected_source_revision text,
  p_decision text,
  p_resolution_note text,
  p_resolved_by uuid
)
returns table (
  id uuid,
  source_id text,
  source_revision text,
  state text,
  resolved_by uuid,
  resolved_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.cadu_institutional_source_reviews%rowtype;
begin
  if p_resolved_by is null or not public.kc_is_admin(p_resolved_by) then
    raise exception 'cadu_review_resolver_is_not_admin' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected', 'superseded') then
    raise exception 'cadu_review_resolution_is_invalid' using errcode = '22023';
  end if;
  if p_resolution_note is not null and length(p_resolution_note) > 1000 then
    raise exception 'cadu_review_resolution_note_is_too_long' using errcode = '22023';
  end if;

  select review.* into v_review
  from public.cadu_institutional_source_reviews review
  where review.id = p_review_id
  for update;
  if not found then
    raise exception 'cadu_review_not_found' using errcode = 'P0002';
  end if;
  if v_review.source_revision <> p_expected_source_revision then
    raise exception 'cadu_review_source_revision_conflict' using errcode = '40001';
  end if;

  if v_review.state <> 'pending' then
    if v_review.state = p_decision
       and v_review.resolution_note is not distinct from p_resolution_note then
      return query select
        v_review.id, v_review.source_id, v_review.source_revision,
        v_review.state, v_review.resolved_by, v_review.resolved_at, true;
      return;
    end if;
    raise exception 'cadu_review_resolution_conflict' using errcode = '23505';
  end if;

  update public.cadu_institutional_source_reviews review
  set state = p_decision,
      resolved_by = p_resolved_by,
      resolved_at = pg_catalog.clock_timestamp(),
      resolution_note = p_resolution_note
  where review.id = p_review_id
  returning review.* into v_review;

  insert into public.audit_log (
    action, entity_type, entity_id, actor_id, payload
  ) values (
    'cadu_institutional_source_review_' || p_decision,
    'cadu_institutional_source_reviews',
    v_review.id,
    p_resolved_by,
    jsonb_build_object(
      'state', v_review.state,
      'source_id', v_review.source_id,
      'source_revision', v_review.source_revision,
      'resolution_note', v_review.resolution_note
    )
  );

  return query select
    v_review.id, v_review.source_id, v_review.source_revision,
    v_review.state, v_review.resolved_by, v_review.resolved_at, false;
end;
$$;

revoke all on function public.kc_resolve_institutional_source_review(
  uuid, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.kc_resolve_institutional_source_review(
  uuid, text, text, text, uuid
) to service_role;

commit;
