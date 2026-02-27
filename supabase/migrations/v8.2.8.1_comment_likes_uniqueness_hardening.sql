-- Kino Campus — V8.2.8.1
-- Hardening: garante 1 like por usuário/comentário em bases legadas com possíveis duplicatas.

begin;

-- Remove duplicatas antigas mantendo o registro mais recente.
with ranked as (
  select
    id,
    row_number() over (
      partition by comment_id, user_id
      order by created_at desc, id desc
    ) as rn
  from public.comment_likes
)
delete from public.comment_likes cl
using ranked r
where cl.id = r.id
  and r.rn > 1;

-- Garante constraint única mesmo em bancos que tinham a tabela sem unique.
alter table if exists public.comment_likes
  drop constraint if exists comment_likes_comment_user_unique;

alter table if exists public.comment_likes
  add constraint comment_likes_comment_user_unique unique (comment_id, user_id);

commit;
