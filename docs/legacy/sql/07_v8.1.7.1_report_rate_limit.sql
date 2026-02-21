-- Kino Campus — V8.1.7.1
-- Rate-limit para Denúncias (Reports)
--
-- Máximo 5 denúncias por usuário por hora.

begin;

create or replace function public.check_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  select count(*)
    into recent_count
    from public.reports
   where reporter_id = new.reporter_id
     and created_at > now() - interval '1 hour';

  if recent_count >= 5 then
    raise exception 'rate_limit_exceeded'
      using hint = 'Você atingiu o limite de 5 denúncias por hora. Tente novamente mais tarde.',
            errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_report_rate_limit on public.reports;
create trigger trg_report_rate_limit
  before insert on public.reports
  for each row
  execute function public.check_report_rate_limit();

-- Apenas o trigger chama a função internamente
revoke execute on function public.check_report_rate_limit() from anon, authenticated;

commit;
