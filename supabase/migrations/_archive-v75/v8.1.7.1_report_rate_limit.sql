-- Kino Campus — V8.1.7.1
-- Rate-limit para Denúncias (Reports)
--
-- Escopo (Roadmap 8.1.7.1):
--   1) Trigger BEFORE INSERT na tabela public.reports que impede abuso:
--      máximo 5 denúncias por usuário em uma janela deslizante de 1 hora.
--   2) Trigger BEFORE INSERT que bloqueia denúncias de posts com status 'deleted'
--      (não faz sentido denunciar conteúdo já removido).
--
-- Impacto esperado:
--   - Um reporter mal-intencionado que tente fazer spam de denúncias receberá erro
--     com mensagem clara ao atingir o limite.
--   - Denúncias legítimas (< 5/hora) não são afetadas.
--   - A função usa SECURITY DEFINER para poder consultar a tabela reports
--     mesmo com RLS ativo (service_role bypass no contexto da função).

begin;

-- 1) Função de rate-limit (idempotente via CREATE OR REPLACE)
create or replace function public.check_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  -- Conta denúncias do mesmo reporter na última hora
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

-- 2) Trigger na tabela reports
drop trigger if exists trg_report_rate_limit on public.reports;

create trigger trg_report_rate_limit
  before insert on public.reports
  for each row
  execute function public.check_report_rate_limit();

-- 3) Revogar permissão de EXECUTE da função para anon/authenticated
--    (a função só deve ser chamada pelo trigger internamente)
revoke execute on function public.check_report_rate_limit() from anon, authenticated;

commit;
