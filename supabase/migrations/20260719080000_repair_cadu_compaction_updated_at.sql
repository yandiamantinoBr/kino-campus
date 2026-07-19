-- Repair the one-time updated_at amplification caused when the Cadu metadata
-- compaction ran against the legacy production trigger name `posts_updated_at`.
--
-- The repair is deliberately compare-and-set: a post is eligible only while
-- it still carries the exact accidental timestamp. Any legitimate update that
-- happened afterwards wins and is left untouched.

begin;

-- Normalize every historical name that invokes the shared posts updated_at
-- helper. Dropping the trigger first also prevents the repair UPDATE from
-- stamping now() again. ALTER/DROP TRIGGER takes the table lock needed to keep
-- the candidate snapshot and the update coherent.
do $migration$
declare
  trigger_row record;
begin
  for trigger_row in
    select trigger_meta.tgname
    from pg_trigger trigger_meta
    where trigger_meta.tgrelid = 'public.posts'::regclass
      and trigger_meta.tgfoid = 'public.kc_set_updated_at()'::regprocedure
      and not trigger_meta.tgisinternal
  loop
    execute format(
      'drop trigger %I on public.posts',
      trigger_row.tgname
    );
  end loop;

  if exists (
    select 1
    from pg_trigger trigger_meta
    where trigger_meta.tgrelid = 'public.posts'::regclass
      and trigger_meta.tgname = 'kc_posts_set_updated_at'
      and not trigger_meta.tgisinternal
  ) then
    raise exception
      'cannot normalize posts updated_at trigger: canonical name is occupied by another function';
  end if;
end
$migration$;

create temporary table kc_cadu_updated_at_repair
on commit drop
as
select
  post_row.id,
  post_row.updated_at as accidental_updated_at,
  post_row.created_at,
  post_row.bumped_at,
  latest_audit.action as latest_audit_action,
  latest_audit.created_at as latest_audit_at,
  latest_view.created_at as latest_view_at,
  latest_vote.created_at as latest_vote_at,
  latest_comment.created_at as latest_comment_at,
  latest_saved.updated_at as latest_saved_at,
  greatest(
    post_row.created_at,
    coalesce(
      case
        when post_row.bumped_at < timestamptz '2026-07-19 05:38:45.26223+00'
          then post_row.bumped_at
      end,
      post_row.created_at
    ),
    coalesce(latest_audit.created_at, post_row.created_at),
    coalesce(latest_view.created_at, post_row.created_at),
    coalesce(latest_vote.created_at, post_row.created_at),
    coalesce(latest_comment.created_at, post_row.created_at),
    coalesce(latest_saved.updated_at, post_row.created_at)
  ) as reconstructed_updated_at,
  case
    when latest_audit.created_at is null
      and latest_view.created_at is null
      and latest_vote.created_at is null
      and latest_comment.created_at is null
      and latest_saved.updated_at is null
      and (
        post_row.bumped_at is null
        or post_row.bumped_at >= timestamptz '2026-07-19 05:38:45.26223+00'
      )
      then 'created_at_no_later_semantic_evidence'
    else 'latest_prior_semantic_evidence'
  end as reconstruction_method
from public.posts post_row
left join lateral (
  select audit_row.action, audit_row.created_at
  from public.audit_log audit_row
  where audit_row.entity_type = 'posts'
    and audit_row.entity_id = post_row.id
    and audit_row.created_at < timestamptz '2026-07-19 05:38:45.26223+00'
    -- Publication audit is emitted just after INSERT. created_at already
    -- represents that operation more accurately than the later audit row.
    and audit_row.action <> 'cadu_post_published'
  order by audit_row.created_at desc, audit_row.id desc
  limit 1
) latest_audit on true
left join lateral (
  select max(view_row.created_at) as created_at
  from public.post_view_events view_row
  where view_row.post_id = post_row.id
    and view_row.created_at < timestamptz '2026-07-19 05:38:45.26223+00'
) latest_view on true
left join lateral (
  select max(vote_row.created_at) as created_at
  from public.post_votes vote_row
  where vote_row.post_id = post_row.id
    and vote_row.created_at < timestamptz '2026-07-19 05:38:45.26223+00'
) latest_vote on true
left join lateral (
  select max(comment_row.created_at) as created_at
  from public.comments comment_row
  where comment_row.post_id = post_row.id
    and comment_row.created_at < timestamptz '2026-07-19 05:38:45.26223+00'
) latest_comment on true
left join lateral (
  select max(saved_row.created_at) as updated_at
  from public.saved_posts saved_row
  where saved_row.post_id = post_row.id
    and saved_row.created_at < timestamptz '2026-07-19 05:38:45.26223+00'
) latest_saved on true
where post_row.updated_at = timestamptz '2026-07-19 05:38:45.26223+00';

do $migration$
begin
  if exists (
    select 1
    from kc_cadu_updated_at_repair repair_row
    where repair_row.reconstructed_updated_at
          >= repair_row.accidental_updated_at
  ) then
    raise exception
      'refusing posts updated_at repair: reconstructed timestamp is not before the accidental timestamp';
  end if;
end
$migration$;

update public.posts post_row
set updated_at = repair_row.reconstructed_updated_at
from kc_cadu_updated_at_repair repair_row
where post_row.id = repair_row.id
  and post_row.updated_at = repair_row.accidental_updated_at;

insert into public.audit_log (
  actor_id,
  action,
  entity_type,
  entity_id,
  payload
)
select
  null,
  'post_updated_at_reconstructed',
  'posts',
  repair_row.id,
  jsonb_build_object(
    'reason', 'cadu_enrichment_source_compaction_trigger_name_mismatch',
    'accidental_updated_at', repair_row.accidental_updated_at,
    'reconstructed_updated_at', repair_row.reconstructed_updated_at,
    'reconstruction_method', repair_row.reconstruction_method,
    'bumped_at', repair_row.bumped_at,
    'latest_prior_audit_action', repair_row.latest_audit_action,
    'latest_prior_audit_at', repair_row.latest_audit_at,
    'latest_prior_view_at', repair_row.latest_view_at,
    'latest_prior_vote_at', repair_row.latest_vote_at,
    'latest_prior_comment_at', repair_row.latest_comment_at,
    'latest_prior_saved_at', repair_row.latest_saved_at,
    'source_migration', '20260719063000_deduplicate_cadu_media_and_enrichment_sources'
  )
from kc_cadu_updated_at_repair repair_row;

create trigger kc_posts_set_updated_at
before update on public.posts
for each row execute function public.kc_set_updated_at();

comment on trigger kc_posts_set_updated_at on public.posts is
  'Keeps posts.updated_at current; canonical name normalized from legacy posts_updated_at.';

do $migration$
declare
  matching_trigger_count integer;
begin
  select count(*)
  into matching_trigger_count
  from pg_trigger trigger_meta
  where trigger_meta.tgrelid = 'public.posts'::regclass
    and trigger_meta.tgfoid = 'public.kc_set_updated_at()'::regprocedure
    and trigger_meta.tgname = 'kc_posts_set_updated_at'
    and trigger_meta.tgenabled = 'O'
    and not trigger_meta.tgisinternal;

  if matching_trigger_count <> 1 then
    raise exception
      'posts updated_at trigger normalization failed: expected 1 enabled canonical trigger, found %',
      matching_trigger_count;
  end if;

  if exists (
    select 1
    from public.posts
    where updated_at = timestamptz '2026-07-19 05:38:45.26223+00'
  ) then
    raise exception
      'posts updated_at repair incomplete: accidental timestamp remains';
  end if;
end
$migration$;

commit;
