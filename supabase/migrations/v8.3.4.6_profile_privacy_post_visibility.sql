-- Kino Campus -- V8.3.4.6
-- Privacidade de perfil + visibilidade de anuncios + ajuste da central de ajuda

begin;

do $$
declare
  v_added_profile_public boolean := false;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'profile_public'
  ) then
    alter table public.profiles
      add column profile_public boolean not null default false;
    v_added_profile_public := true;
  end if;

  if v_added_profile_public then
    update public.profiles
       set profile_public = true;
  end if;
end $$;

do $$
declare
  v_added_visibility boolean := false;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name = 'visibility'
  ) then
    alter table public.posts
      add column visibility text not null default 'community';
    v_added_visibility := true;
  end if;

  if v_added_visibility then
    update public.posts
       set visibility = 'public';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'posts_visibility_check'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_visibility_check
      check (visibility in ('public', 'community'));
  end if;
end $$;

create index if not exists profiles_profile_public_idx
  on public.profiles (profile_public);

create index if not exists posts_visibility_status_idx
  on public.posts (visibility, status, created_at desc);

grant insert (profile_public) on table public.profiles to authenticated;
grant update (profile_public) on table public.profiles to authenticated;
grant insert (visibility) on table public.posts to authenticated;
grant update (visibility) on table public.posts to authenticated;

create or replace function public.kc_can_read_post(
  p_author_id uuid,
  p_status text,
  p_visibility text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(auth.role(), 'anon') = 'authenticated' then
      (
        (coalesce(p_status, 'published') = 'published' and coalesce(p_visibility, 'public') in ('public', 'community'))
        or (select auth.uid()) = p_author_id
        or public.kc_is_admin((select auth.uid()))
      )
    else
      (
        coalesce(p_status, 'published') = 'published'
        and coalesce(p_visibility, 'public') = 'public'
      )
  end;
$$;

revoke all on function public.kc_can_read_post(uuid, text, text) from public;
grant execute on function public.kc_can_read_post(uuid, text, text) to anon, authenticated;

drop policy if exists profiles_select_public on public.profiles;
drop policy if exists profiles_select_public_anon on public.profiles;
drop policy if exists profiles_select_authenticated on public.profiles;

create policy profiles_select_public_anon
  on public.profiles for select
  to anon
  using (profile_public = true);

create policy profiles_select_authenticated
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists posts_select_public on public.posts;
drop policy if exists posts_select_published on public.posts;
drop policy if exists posts_select_admin on public.posts;
drop policy if exists posts_select_public_anon on public.posts;
drop policy if exists posts_select_authenticated on public.posts;

create policy posts_select_public_anon
  on public.posts for select
  to anon
  using (public.kc_can_read_post(author_id, status, visibility));

create policy posts_select_authenticated
  on public.posts for select
  to authenticated
  using (public.kc_can_read_post(author_id, status, visibility));

drop policy if exists comments_select_public on public.comments;
drop policy if exists comments_select_public_anon on public.comments;
drop policy if exists comments_select_authenticated on public.comments;

create policy comments_select_public_anon
  on public.comments for select
  to anon
  using (
    exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
        and public.kc_can_read_post(p.author_id, p.status, p.visibility)
    )
  );

create policy comments_select_authenticated
  on public.comments for select
  to authenticated
  using (
    author_id = (select auth.uid())
    or public.kc_is_admin((select auth.uid()))
    or exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
        and public.kc_can_read_post(p.author_id, p.status, p.visibility)
    )
  );

drop policy if exists saved_posts_select_public_highlights on public.saved_posts;
drop policy if exists saved_posts_select_public_highlights_anon on public.saved_posts;
drop policy if exists saved_posts_select_highlights_authenticated on public.saved_posts;

create policy saved_posts_select_public_highlights_anon
  on public.saved_posts for select
  to anon
  using (
    kind = 'highlight'
    and exists (
      select 1
      from public.posts p
      join public.profiles pr on pr.id = saved_posts.user_id
      where p.id = saved_posts.post_id
        and p.status = 'published'
        and coalesce(p.visibility, 'public') = 'public'
        and pr.profile_public = true
    )
  );

create policy saved_posts_select_highlights_authenticated
  on public.saved_posts for select
  to authenticated
  using (
    kind = 'highlight'
    and exists (
      select 1
      from public.posts p
      where p.id = saved_posts.post_id
        and public.kc_can_read_post(p.author_id, p.status, p.visibility)
    )
  );

create or replace function public.kc_get_profile_access_state(
  p_profile_id uuid
)
returns table (
  "exists" boolean,
  profile_public boolean
)
language sql
security definer
set search_path = public
as $$
  select
    true as "exists",
    coalesce(p.profile_public, false) as profile_public
  from public.profiles p
  where p.id = p_profile_id

  union all

  select
    false as "exists",
    false as profile_public
  where not exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
  );
$$;

grant execute on function public.kc_get_profile_access_state(uuid) to anon, authenticated;

create or replace function public.kc_get_profile_highlights(
  p_profile_id uuid,
  p_page integer default 1,
  p_limit integer default 12
)
returns table (
  post_uuid uuid,
  legacy_id text,
  title text,
  created_at timestamptz,
  status text,
  module text,
  category text,
  saved_at timestamptz,
  save_kinds text[]
)
language sql
stable
as $$
  with normalized as (
    select greatest(coalesce(p_page, 1), 1) as page_number,
           least(greatest(coalesce(p_limit, 12), 1), 50) as page_size
  ),
  grouped as (
    select
      sp.post_id,
      max(coalesce(sp.updated_at, sp.created_at)) as saved_at
    from public.saved_posts sp
    where sp.user_id = p_profile_id
      and sp.kind = 'highlight'
    group by sp.post_id
  )
  select
    p.id as post_uuid,
    coalesce(p.legacy_id::text, p.id::text) as legacy_id,
    p.title,
    p.created_at,
    p.status,
    p.module,
    p.category,
    g.saved_at,
    array['highlight']::text[] as save_kinds
  from grouped g
  join public.posts p on p.id = g.post_id
  join public.profiles pr on pr.id = p_profile_id
  cross join normalized n
  where p.status = 'published'
    and (
      (
        coalesce(auth.role(), 'anon') = 'authenticated'
        and coalesce(p.visibility, 'public') in ('public', 'community')
      )
      or (
        coalesce(auth.role(), 'anon') <> 'authenticated'
        and pr.profile_public = true
        and coalesce(p.visibility, 'public') = 'public'
      )
    )
  order by g.saved_at desc, p.created_at desc
  limit (select page_size from normalized)
  offset ((select page_number from normalized) - 1) * (select page_size from normalized);
$$;

create or replace function public.kc_get_profile_highlights_count(
  p_profile_id uuid
)
returns bigint
language sql
stable
as $$
  select count(*)
  from (
    select sp.post_id
    from public.saved_posts sp
    join public.posts p on p.id = sp.post_id
    join public.profiles pr on pr.id = p_profile_id
    where sp.user_id = p_profile_id
      and sp.kind = 'highlight'
      and p.status = 'published'
      and (
        (
          coalesce(auth.role(), 'anon') = 'authenticated'
          and coalesce(p.visibility, 'public') in ('public', 'community')
        )
        or (
          coalesce(auth.role(), 'anon') <> 'authenticated'
          and pr.profile_public = true
          and coalesce(p.visibility, 'public') = 'public'
        )
      )
    group by sp.post_id
  ) grouped;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'help_requests'
  ) then
    update public.help_requests
       set type = case lower(trim(type))
         when 'question' then 'question'
         when 'complaint' then 'platform_issue'
         when 'praise' then 'suggestion_praise'
         when 'report' then 'report'
         when 'account_access' then 'account_access'
         else 'question'
       end;

    update public.help_requests
       set topic = case type
         when 'question' then
           case lower(trim(topic))
             when 'profile' then 'profile_contact'
             when 'contact' then 'profile_contact'
             when 'posts' then 'publishing_navigation'
             when 'platform_use' then 'publishing_navigation'
             when 'payment_benefit' then 'modules_filters'
             when 'security' then 'modules_filters'
             else 'modules_filters'
           end
         when 'platform_issue' then
           case lower(trim(topic))
             when 'posts' then 'create_edit_post'
             when 'platform_use' then 'bugs_crashes'
             when 'profile' then 'bugs_crashes'
             when 'contact' then 'search_filters'
             when 'payment_benefit' then 'create_edit_post'
             when 'security' then 'slow_performance'
             else 'bugs_crashes'
           end
         when 'account_access' then
           case lower(trim(topic))
             when 'security' then 'password'
             when 'profile' then 'onboarding_settings'
             when 'contact' then 'onboarding_settings'
             when 'platform_use' then 'login_signup'
             when 'posts' then 'login_signup'
             else 'login_signup'
           end
         when 'report' then
           case lower(trim(topic))
             when 'profile' then 'profile_user'
             when 'contact' then 'inappropriate_contact'
             when 'security' then 'security'
             else 'post'
           end
         when 'suggestion_praise' then
           case lower(trim(topic))
             when 'posts' then 'specific_module'
             when 'payment_benefit' then 'community'
             else 'general_experience'
           end
         else 'publishing_navigation'
       end;

    alter table public.help_requests
      drop constraint if exists help_requests_type_check;

    alter table public.help_requests
      drop constraint if exists help_requests_topic_check;

    alter table public.help_requests
      add constraint help_requests_type_check check (
        type in ('question', 'platform_issue', 'account_access', 'report', 'suggestion_praise')
      );

    alter table public.help_requests
      add constraint help_requests_topic_check check (
        topic in (
          'publishing_navigation',
          'modules_filters',
          'profile_contact',
          'bugs_crashes',
          'slow_performance',
          'search_filters',
          'create_edit_post',
          'login_signup',
          'email_confirmation',
          'password',
          'onboarding_settings',
          'post',
          'profile_user',
          'inappropriate_contact',
          'security',
          'general_experience',
          'specific_module',
          'community'
        )
      );
  end if;
end $$;

commit;
