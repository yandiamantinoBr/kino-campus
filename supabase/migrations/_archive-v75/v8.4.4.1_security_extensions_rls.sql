-- ============================================================
-- KinoCampus — V8.4.4.1
-- Security: extensions schema + home_category_affinity RLS
--
-- Resolve:
--   1. [extension_in_public] pg_trgm instalada no schema public
--      → Move para schema 'extensions' (se relocatable)
--   2. [extension_in_public] pg_net instalada no schema public
--      → Tenta mover; pg_net pode não ser relocatable no Supabase gerenciado
--   3. [rls_enabled_no_policy] home_category_affinity com RLS habilitado e sem políticas
--      → Adiciona políticas explícitas que refletem o acesso pretendido
--
-- NOTA sobre auth_leaked_password_protection:
--   Este WARNING não pode ser resolvido via SQL. Para habilitá-lo:
--   Dashboard Supabase → Authentication → Sign In / Up → Password Security
--   → Enable "Leaked Password Protection (HaveIBeenPwned.org)"
-- ============================================================

begin;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Mover extensões para schema 'extensions'
--    pg_trgm e pg_net são relocatable em algumas versões do Postgres.
--    Usa DO block idempotente para não falhar se já estiver no schema correto
--    ou se a extensão não for relocatable.
-- ──────────────────────────────────────────────────────────────────────────────

create schema if not exists extensions;

do $$
declare
  v_ext    text;
  v_schema text;
  v_reloc  boolean;
begin
  foreach v_ext in array array['pg_trgm', 'pg_net'] loop
    select n.nspname, e.extrelocatable
    into v_schema, v_reloc
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = v_ext;

    if not found then
      raise notice 'Extensão % não encontrada, pulando.', v_ext;
      continue;
    end if;

    if v_schema = 'extensions' then
      raise notice 'Extensão % já está no schema extensions.', v_ext;
      continue;
    end if;

    if v_reloc then
      execute format('alter extension %I set schema extensions', v_ext);
      raise notice 'Extensão % movida de % para extensions.', v_ext, v_schema;
    else
      raise notice 'Extensão % não é relocatable (schema atual: %). Mantida em %.', v_ext, v_schema, v_schema;
    end if;
  end loop;
end
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. home_category_affinity — Políticas RLS explícitas
--    RLS está habilitado mas nenhuma política existe → Performance Advisor INFO.
--    Toda escrita nesta tabela ocorre via funções SECURITY DEFINER (bypass RLS),
--    então as policies abaixo são de defesa em profundidade e documentação de intenção.
--    Usuários autenticados podem LER seus próprios dados de afinidade.
--    Sessões anônimas NÃO têm acesso direto à tabela (grants já estão revogados).
-- ──────────────────────────────────────────────────────────────────────────────

-- SELECT: usuário autenticado lê apenas seus próprios dados de afinidade por usuário
drop policy if exists hca_select_own on public.home_category_affinity;
create policy hca_select_own
  on public.home_category_affinity for select
  to authenticated
  using (
    (owner_kind = 'user' and user_id = (select auth.uid()))
  );

-- ALL para service_role (acesso total via funções SECURITY DEFINER)
-- Note: service_role bypassa RLS por padrão no Supabase,
-- então esta policy é meramente documentativa.
drop policy if exists hca_service_role_all on public.home_category_affinity;
create policy hca_service_role_all
  on public.home_category_affinity for all
  to service_role
  using (true)
  with check (true);

commit;
