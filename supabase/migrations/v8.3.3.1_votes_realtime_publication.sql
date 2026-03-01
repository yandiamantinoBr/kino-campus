-- ============================================================
-- v8.3.3.1 — Realtime de votos (posts + post_votes)
-- Garante que alterações de votos sejam publicadas no Realtime.
-- ============================================================

begin;

-- Para payloads UPDATE completos no Realtime (inclui coluna `votos`).
alter table if exists public.posts replica identity full;
alter table if exists public.post_votes replica identity full;

-- Inclui as tabelas na publication usada pelo Supabase Realtime.
do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    begin
      alter publication supabase_realtime add table public.posts;
    exception
      when duplicate_object then null;
      when invalid_object_definition then null;
    end;

    begin
      alter publication supabase_realtime add table public.post_votes;
    exception
      when duplicate_object then null;
      when invalid_object_definition then null;
    end;
  end if;
end $$;

commit;
