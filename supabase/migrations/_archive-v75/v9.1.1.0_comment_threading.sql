-- ============================================================
-- KinoCampus v9.1.1.0 - Comment Threading
-- ============================================================
--
-- Adds one-level comment threading with:
--   - comments.parent_id
--   - depth validation trigger
--   - reply notification trigger
--   - comment notification function aligned to comments.body
-- ============================================================

begin;

alter table public.comments
  add column if not exists parent_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.comments'::regclass
      and conname = 'comments_parent_id_fkey'
  ) then
    alter table public.comments
      add constraint comments_parent_id_fkey
      foreign key (parent_id) references public.comments(id) on delete cascade;
  end if;
end $$;

create index if not exists idx_comments_parent_id
  on public.comments(parent_id);

comment on column public.comments.parent_id is
  'Threading de comentarios: resposta para comentario raiz (maximo de 1 nivel).';

create or replace function public.kc_check_comment_depth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent record;
  v_has_children boolean := false;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception using
      errcode = 'check_violation',
      message = 'Comentario nao pode responder a si mesmo.';
  end if;

  select id, post_id, parent_id
    into v_parent
  from public.comments
  where id = new.parent_id;

  if v_parent is null then
    raise exception using
      errcode = 'foreign_key_violation',
      message = 'Comentario pai nao encontrado.';
  end if;

  if v_parent.post_id <> new.post_id then
    raise exception using
      errcode = 'check_violation',
      message = 'Resposta deve pertencer ao mesmo post.';
  end if;

  if v_parent.parent_id is not null then
    raise exception using
      errcode = 'check_violation',
      message = 'Apenas 1 nivel de resposta e permitido.';
  end if;

  if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id then
    select exists(
      select 1
      from public.comments child
      where child.parent_id = new.id
    ) into v_has_children;

    if v_has_children then
      raise exception using
        errcode = 'check_violation',
        message = 'Comentario que ja possui respostas nao pode virar resposta.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists kc_trigger_check_comment_depth on public.comments;
create trigger kc_trigger_check_comment_depth
  before insert or update of parent_id, post_id on public.comments
  for each row
  execute function public.kc_check_comment_depth();

create or replace function public.kc_notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post record;
  v_actor_name text;
begin
  select id, author_id, title, module
    into v_post
  from public.posts
  where id = new.post_id;

  if v_post is null or v_post.author_id = new.author_id then
    return new;
  end if;

  select coalesce(display_name, full_name)
    into v_actor_name
  from public.profiles
  where id = new.author_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_post.author_id,
    'comment_on_post',
    coalesce(v_actor_name, 'Alguem') || ' comentou no seu post',
    left(coalesce(new.body, ''), 120),
    jsonb_build_object(
      'post_id', v_post.id::text,
      'post_title', left(coalesce(v_post.title, ''), 80),
      'comment_id', new.id::text,
      'actor_id', new.author_id::text,
      'actor_name', coalesce(v_actor_name, ''),
      'module', v_post.module
    )
  );

  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.kc_notify_on_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent record;
  v_post record;
  v_actor_name text;
begin
  if new.parent_id is null then
    return new;
  end if;

  select id, author_id, post_id
    into v_parent
  from public.comments
  where id = new.parent_id;

  if v_parent is null or v_parent.author_id = new.author_id then
    return new;
  end if;

  select id, title, module
    into v_post
  from public.posts
  where id = new.post_id;

  select coalesce(display_name, full_name)
    into v_actor_name
  from public.profiles
  where id = new.author_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_parent.author_id,
    'comment_reply',
    coalesce(v_actor_name, 'Alguem') || ' respondeu seu comentario',
    left(coalesce(new.body, ''), 120),
    jsonb_build_object(
      'post_id', new.post_id::text,
      'post_title', left(coalesce(v_post.title, ''), 80),
      'comment_id', new.id::text,
      'parent_comment_id', new.parent_id::text,
      'actor_id', new.author_id::text,
      'actor_name', coalesce(v_actor_name, ''),
      'module', coalesce(v_post.module, '')
    )
  );

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists kc_trigger_notify_on_comment_reply on public.comments;
create trigger kc_trigger_notify_on_comment_reply
  after insert on public.comments
  for each row
  execute function public.kc_notify_on_comment_reply();

commit;
