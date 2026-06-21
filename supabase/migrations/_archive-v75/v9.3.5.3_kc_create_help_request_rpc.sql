-- Kino Campus -- v9.3.5.3
-- RPC kc_create_help_request com SECURITY DEFINER para contornar erro RLS
-- 42501 ("new row violates row-level security policy for table help_requests")
-- que afetava o fluxo de "Solicitar acesso externo" (kc-auth-external-access)
-- e qualquer chamada anon de createHelpRequest.
--
-- DIAGNÓSTICO:
-- - Tabela help_requests tem RLS habilitado e policy INSERT permissiva
--   "((user_id IS NULL) OR (user_id = (SELECT auth.uid())))" para roles
--   {anon, authenticated}.
-- - GRANT INSERT existe para anon e authenticated.
-- - Avaliação manual da expressão como anon retornava TRUE.
-- - Mesmo substituindo a policy por "WITH CHECK (true)" puro o INSERT REST
--   continuava retornando 42501 (reproduzido via curl com anon JWT real).
-- - Causa raiz não identificada (parece quirk do PostgREST/Supabase em
--   tabelas com RLS+grant para anon nesse projeto específico).
--
-- SOLUÇÃO:
-- - RPC SECURITY DEFINER que valida payload no servidor e insere com
--   privilégio elevado (postgres role), bypassando RLS de help_requests.
-- - Propaga auth.uid() para callers autenticados; insere com user_id=NULL
--   para anônimos (fluxo de acesso externo, ajuda sem login).
-- - Validações: type, topic, subject (1-280 chars), message (10-4000 chars),
--   contact_email (regex), priority (whitelist).
-- - Concedido EXECUTE para anon e authenticated.

create or replace function public.kc_create_help_request(p_payload jsonb)
returns table (
  out_id uuid,
  out_created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_created_at timestamptz;
  v_user uuid := auth.uid();
  v_type text := coalesce(p_payload->>'type', '');
  v_topic text := coalesce(p_payload->>'topic', '');
  v_subject text := coalesce(p_payload->>'subject', '');
  v_message text := coalesce(p_payload->>'message', '');
  v_email text := coalesce(p_payload->>'contact_email', '');
  v_priority text := coalesce(p_payload->>'priority', 'normal');
begin
  -- Validações básicas
  if v_type = '' then raise exception 'type is required'; end if;
  if v_topic = '' then raise exception 'topic is required'; end if;
  if length(trim(v_subject)) < 1 then raise exception 'subject is required'; end if;
  if length(trim(v_subject)) > 280 then raise exception 'subject too long'; end if;
  if length(trim(v_message)) < 10 then raise exception 'message must have at least 10 chars'; end if;
  if length(trim(v_message)) > 4000 then raise exception 'message too long'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'valid contact_email is required'; end if;
  if v_priority not in ('low', 'normal', 'high') then v_priority := 'normal'; end if;

  insert into public.help_requests (
    user_id,
    type,
    topic,
    subtopic,
    subject,
    message,
    priority,
    page_path,
    contact_email,
    allow_contact,
    metadata
  ) values (
    v_user, -- auth.uid() ou NULL para anon
    v_type,
    v_topic,
    nullif(p_payload->>'subtopic', ''),
    trim(v_subject),
    trim(v_message),
    v_priority,
    nullif(p_payload->>'page_path', ''),
    trim(lower(v_email)),
    coalesce((p_payload->>'allow_contact')::boolean, true),
    coalesce(p_payload->'metadata', '{}'::jsonb)
  )
  returning id, created_at into v_id, v_created_at;

  out_id := v_id;
  out_created_at := v_created_at;
  return next;
end;
$$;

revoke all on function public.kc_create_help_request(jsonb) from public;
grant execute on function public.kc_create_help_request(jsonb) to anon, authenticated;

comment on function public.kc_create_help_request(jsonb) is
  'v9.3.5.3: cria help_request via SECURITY DEFINER. Valida payload e propaga '
  'auth.uid() para autenticados (NULL para anon). Workaround para o bug RLS em '
  'help_requests onde anon não conseguia inserir mesmo com WITH CHECK permissivo.';
