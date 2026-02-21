-- Kino Campus — V8.1.11.1
-- Notificação admin ao atingir limiar de denúncias abertas (3+)
--
-- Estratégia A (tempo real): trigger AFTER INSERT em public.reports -> HTTP para Edge Function.
-- Segurança:
--   - Chamada autenticada via Authorization Bearer + assinatura HMAC (SHA-256).
--   - Segredos NÃO ficam no repositório: vêm de custom settings no banco.
--   - Funções internas em SECURITY DEFINER com EXECUTE revogado para client roles.

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_net;

-- Função principal chamada pelo trigger de reports.
-- Somente aciona HTTP quando o post já possui >= 3 reports em status open.
create or replace function public.notify_admin_if_reports_threshold(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open_count integer;
  v_function_url text;
  v_function_auth_token text;
  v_hmac_secret text;
  v_timestamp text;
  v_body jsonb;
  v_signature text;
begin
  if p_post_id is null then
    return;
  end if;

  select count(*)
    into v_open_count
    from public.reports
   where post_id = p_post_id
     and status = 'open';

  if v_open_count < 3 then
    return;
  end if;

  -- Runtime settings (devem ser configuradas fora do git):
  -- app.settings.kc_notify_function_url
  -- app.settings.kc_notify_function_auth_token
  -- app.settings.kc_notify_hmac_secret
  v_function_url := nullif(current_setting('app.settings.kc_notify_function_url', true), '');
  v_function_auth_token := nullif(current_setting('app.settings.kc_notify_function_auth_token', true), '');
  v_hmac_secret := nullif(current_setting('app.settings.kc_notify_hmac_secret', true), '');

  -- Fail-closed: sem configuração válida, não dispara requisição externa.
  if v_function_url is null or v_function_auth_token is null or v_hmac_secret is null then
    return;
  end if;

  v_body := jsonb_build_object('post_id', p_post_id);
  v_timestamp := floor(extract(epoch from now()))::bigint::text;
  v_signature := encode(hmac(v_timestamp || '.' || p_post_id::text, v_hmac_secret, 'sha256'), 'hex');

  perform net.http_post(
    url := v_function_url,
    body := v_body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_function_auth_token,
      'x-kc-source', 'reports-trigger',
      'x-kc-post-id', p_post_id::text,
      'x-kc-timestamp', v_timestamp,
      'x-kc-signature', v_signature
    )
  );
end;
$$;

create or replace function public.trg_notify_admin_reports_threshold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'open' then
    perform public.notify_admin_if_reports_threshold(new.post_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_admin_reports_threshold on public.reports;
create trigger trg_notify_admin_reports_threshold
  after insert on public.reports
  for each row
  execute function public.trg_notify_admin_reports_threshold();

revoke execute on function public.notify_admin_if_reports_threshold(uuid) from anon, authenticated;
revoke execute on function public.trg_notify_admin_reports_threshold() from anon, authenticated;

commit;

-- Configuração (manual, fora do versionamento) — exemplo:
-- alter database postgres set app.settings.kc_notify_function_url =
--   'https://<PROJECT_REF>.functions.supabase.co/notify-admin-reports-threshold';
-- alter database postgres set app.settings.kc_notify_function_auth_token = '<SERVICE_ROLE_JWT>';
-- alter database postgres set app.settings.kc_notify_hmac_secret = '<RANDOM_32+_CHARS_SECRET>';
