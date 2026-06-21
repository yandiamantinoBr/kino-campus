-- Kino Campus — V8.2.8.0
-- Likes de comentários com vínculo por usuário (1 like por usuário/comentário)

begin;

create table if not exists public.comment_likes (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint comment_likes_comment_user_unique unique (comment_id, user_id)
);

create index if not exists comment_likes_comment_id_idx on public.comment_likes(comment_id);
create index if not exists comment_likes_user_id_idx on public.comment_likes(user_id);

alter table public.comment_likes enable row level security;

drop policy if exists comment_likes_select_public on public.comment_likes;
drop policy if exists comment_likes_insert_own on public.comment_likes;
drop policy if exists comment_likes_delete_own on public.comment_likes;

create policy comment_likes_select_public
  on public.comment_likes for select
  using (true);

create policy comment_likes_insert_own
  on public.comment_likes for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy comment_likes_delete_own
  on public.comment_likes for delete
  to authenticated
  using (auth.uid() = user_id);

grant select on table public.comment_likes to anon, authenticated;
grant insert, delete on table public.comment_likes to authenticated;
grant all on table public.comment_likes to service_role;

-- Compatibilidade com bases que já possuem increment_comment_likes(uuid) retornando integer
-- (migrações v8.1.x). CREATE OR REPLACE não permite alterar tipo de retorno,
-- então removemos a assinatura antes de recriar em jsonb.
drop function if exists public.increment_comment_likes(uuid);

create function public.increment_comment_likes(comment_uuid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  affected_rows integer := 0;
  total_likes integer := 0;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'AUTH_REQUIRED',
      'message', 'Faça login para curtir.'
    );
  end if;

  if not exists (select 1 from public.comments where id = comment_uuid) then
    return jsonb_build_object(
      'ok', false,
      'code', 'COMMENT_NOT_FOUND',
      'message', 'Comentário não encontrado.'
    );
  end if;

  insert into public.comment_likes(comment_id, user_id)
  values (comment_uuid, current_user_id)
  on conflict (comment_id, user_id) do nothing;

  get diagnostics affected_rows = row_count;

  select count(*)::integer
    into total_likes
    from public.comment_likes
   where comment_id = comment_uuid;

  update public.comments
     set likes = total_likes
   where id = comment_uuid;

  if affected_rows > 0 then
    return jsonb_build_object(
      'ok', true,
      'liked', true,
      'likes', total_likes
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'liked', false,
    'already_liked', true,
    'likes', total_likes,
    'message', 'Você já curtiu este comentário.'
  );
end;
$$;

grant execute on function public.increment_comment_likes(uuid) to authenticated;

commit;
