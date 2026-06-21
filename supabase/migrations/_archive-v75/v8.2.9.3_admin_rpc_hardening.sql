-- Kino Campus — V8.2.9.3
-- Hardening definitivo do RPC de moderação admin:
--   1. SET LOCAL row_security = off  → garante que o UPDATE nunca é bloqueado por RLS
--      mesmo se FORCE ROW LEVEL SECURITY for habilitado futuramente.
--   2. Reforço de diagnóstico: retorna 'code' em todos os branches.
--   3. Idempotente: pode ser rodada múltiplas vezes sem efeito colateral.

begin;

create or replace function public.kc_admin_set_post_status(
  p_post_id      uuid,
  p_status       text,
  p_close_reports boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid;
  v_status       text;
  v_post_exists  boolean;
  v_updated      integer := 0;
  v_closed       integer := 0;
begin
  -- ── Autenticação ───────────────────────────────────────────────────────────
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object(
      'ok',      false,
      'code',    'AUTH_REQUIRED',
      'message', 'Faça login para moderar.'
    );
  end if;

  -- ── Autorização ────────────────────────────────────────────────────────────
  if not public.kc_is_admin(v_uid) then
    return jsonb_build_object(
      'ok',      false,
      'code',    'FORBIDDEN',
      'message', 'Apenas administradores podem moderar posts.'
    );
  end if;

  -- ── Validação de status ────────────────────────────────────────────────────
  v_status := lower(trim(coalesce(p_status, '')));
  if v_status not in ('published', 'pending', 'hidden', 'deleted') then
    return jsonb_build_object(
      'ok',      false,
      'code',    'INVALID_STATUS',
      'message', 'Status de moderação inválido: ' || coalesce(v_status, '(vazio)')
    );
  end if;

  -- ── Existência do post ─────────────────────────────────────────────────────
  -- Desativa RLS localmente para garantir que superuser/service_role veja tudo
  set local row_security = off;

  select exists(
    select 1 from public.posts where id = p_post_id
  ) into v_post_exists;

  if not v_post_exists then
    return jsonb_build_object(
      'ok',      false,
      'code',    'POST_NOT_FOUND',
      'message', 'Post não encontrado: ' || coalesce(p_post_id::text, '(null)')
    );
  end if;

  -- ── UPDATE principal ───────────────────────────────────────────────────────
  -- row_security já está off nesta transação (via SET LOCAL acima)
  update public.posts
     set status     = v_status,
         updated_at = now()
   where id = p_post_id;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return jsonb_build_object(
      'ok',      false,
      'code',    'UPDATE_NOT_APPLIED',
      'message', 'O UPDATE não afetou nenhuma linha. Verifique se o post existe e se o banco está íntegro.',
      'post_id', p_post_id,
      'status',  v_status
    );
  end if;

  -- ── Fechar denúncias abertas (opcional) ───────────────────────────────────
  if p_close_reports then
    update public.reports
       set status = 'closed'
     where post_id = p_post_id
       and status  = 'open';

    get diagnostics v_closed = row_count;
  end if;

  -- ── Sucesso ────────────────────────────────────────────────────────────────
  return jsonb_build_object(
    'ok',             true,
    'code',           'OK',
    'updated_posts',  v_updated,
    'closed_reports', v_closed,
    'post_id',        p_post_id,
    'status',         v_status
  );
end;
$$;

-- Garante grants corretos (idempotente)
revoke all on function public.kc_admin_set_post_status(uuid, text, boolean) from public;
grant execute on function public.kc_admin_set_post_status(uuid, text, boolean)
  to authenticated, service_role;

commit;
