-- KinoCampus - LGPD account erasure workflow
-- Tracks account-erasure requests without storing the raw requester e-mail.

begin;

create extension if not exists pgcrypto;

create table if not exists public.account_erasure_requests (
  id uuid primary key default gen_random_uuid(),
  help_request_id uuid null references public.help_requests(id) on delete set null,
  user_id uuid null references public.profiles(id) on delete set null,
  email_hash text not null check (email_hash ~ '^[a-f0-9]{64}$'),
  target_email_domain text null check (target_email_domain is null or char_length(target_email_domain) <= 120),
  status text not null default 'diagnosed' check (
    status in (
      'diagnosed',
      'pending_confirmation',
      'reversible_applied',
      'erased',
      'cancelled',
      'failed'
    )
  ),
  requested_at timestamptz not null default now(),
  confirmation_requested_at timestamptz null,
  confirmed_at timestamptz null,
  reversible_applied_at timestamptz null,
  erased_at timestamptz null,
  processed_by uuid null references public.profiles(id) on delete set null,
  counts jsonb not null default '{}'::jsonb,
  receipt jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_erasure_counts_object_check check (jsonb_typeof(counts) = 'object'),
  constraint account_erasure_receipt_object_check check (jsonb_typeof(receipt) = 'object'),
  constraint account_erasure_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists account_erasure_requests_email_hash_idx
  on public.account_erasure_requests (email_hash, created_at desc);

create index if not exists account_erasure_requests_help_request_idx
  on public.account_erasure_requests (help_request_id);

create index if not exists account_erasure_requests_user_status_idx
  on public.account_erasure_requests (user_id, status, created_at desc);

drop trigger if exists trg_account_erasure_requests_set_updated_at on public.account_erasure_requests;
create trigger trg_account_erasure_requests_set_updated_at
  before update on public.account_erasure_requests
  for each row execute function public.kc_set_updated_at();

alter table public.account_erasure_requests enable row level security;

drop policy if exists account_erasure_requests_select_admin on public.account_erasure_requests;
drop policy if exists account_erasure_requests_insert_admin on public.account_erasure_requests;
drop policy if exists account_erasure_requests_update_admin on public.account_erasure_requests;

create policy account_erasure_requests_select_admin
  on public.account_erasure_requests
  for select to authenticated
  using (public.kc_is_admin((select auth.uid())));

create policy account_erasure_requests_insert_admin
  on public.account_erasure_requests
  for insert to authenticated
  with check (public.kc_is_admin((select auth.uid())));

create policy account_erasure_requests_update_admin
  on public.account_erasure_requests
  for update to authenticated
  using (public.kc_is_admin((select auth.uid())))
  with check (public.kc_is_admin((select auth.uid())));

revoke all on table public.account_erasure_requests from public, anon, authenticated;
grant select, insert, update on table public.account_erasure_requests to authenticated;
grant all on table public.account_erasure_requests to service_role;

comment on table public.account_erasure_requests is
  'Admin-only LGPD account-erasure workflow. Stores hashed e-mail, request status, counts and receipt, but not raw requester e-mail.';

commit;
