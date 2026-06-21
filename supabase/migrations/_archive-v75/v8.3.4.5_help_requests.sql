-- Kino Campus -- V8.3.4.5
-- Central de ajuda + triagem administrativa

begin;

create table if not exists public.help_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references public.profiles(id) on delete set null,
  type text not null,
  topic text not null,
  subtopic text null,
  subject text not null,
  message text not null,
  priority text not null default 'normal',
  status text not null default 'new',
  page_path text null,
  contact_email text not null,
  allow_contact boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint help_requests_type_check check (
    type in ('question', 'complaint', 'praise', 'report', 'account_access')
  ),
  constraint help_requests_topic_check check (
    topic in ('platform_use', 'posts', 'profile', 'contact', 'payment_benefit', 'security', 'other')
  ),
  constraint help_requests_priority_check check (
    priority in ('low', 'normal', 'high', 'urgent')
  ),
  constraint help_requests_status_check check (
    status in ('new', 'triaged', 'in_progress', 'resolved', 'archived')
  ),
  constraint help_requests_subject_length_check check (char_length(subject) between 3 and 140),
  constraint help_requests_message_length_check check (char_length(message) between 10 and 4000),
  constraint help_requests_page_path_length_check check (page_path is null or char_length(page_path) <= 255),
  constraint help_requests_contact_email_length_check check (char_length(contact_email) <= 255),
  constraint help_requests_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists help_requests_status_created_idx
  on public.help_requests (status, created_at desc);

create index if not exists help_requests_type_created_idx
  on public.help_requests (type, created_at desc);

create index if not exists help_requests_priority_created_idx
  on public.help_requests (priority, created_at desc);

create index if not exists help_requests_user_created_idx
  on public.help_requests (user_id, created_at desc);

drop trigger if exists trg_help_requests_set_updated_at on public.help_requests;
create trigger trg_help_requests_set_updated_at
  before update on public.help_requests
  for each row execute function public.kc_set_updated_at();

alter table public.help_requests enable row level security;

drop policy if exists help_requests_insert_public on public.help_requests;
create policy help_requests_insert_public
  on public.help_requests
  for insert
  to anon, authenticated
  with check (
    user_id is null
    or user_id = auth.uid()
  );

drop policy if exists help_requests_select_own on public.help_requests;
create policy help_requests_select_own
  on public.help_requests
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.kc_is_admin(auth.uid())
  );

drop policy if exists help_requests_update_admin on public.help_requests;
create policy help_requests_update_admin
  on public.help_requests
  for update
  to authenticated
  using (public.kc_is_admin(auth.uid()))
  with check (public.kc_is_admin(auth.uid()));

grant select, insert, update on public.help_requests to authenticated;
grant insert on public.help_requests to anon;

commit;
