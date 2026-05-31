-- KinoCampus 2026-05-31
-- Revisão profunda /admin/ (rodada 3) — performance do banco nas tabelas das
-- páginas admin. Corrige o advisor `auth_rls_initplan` (RLS reavaliando
-- auth.<fn>() por linha) envolvendo as chamadas de auth em (select ...), o que
-- faz o Postgres avaliar uma única vez (InitPlan) em vez de por linha.
--
-- Cada política é alterada via ALTER POLICY (sem janela sem policy); a expressão
-- é idêntica à atual, mudando APENAS auth.uid() -> (select auth.uid()) e
-- kc_is_admin(auth.uid()) -> kc_is_admin((select auth.uid())).
-- Também remove um índice 100% duplicado em public.posts.

begin;

-- ── post_flood_limits (Moderação) ──
alter policy post_flood_limits_select on public.post_flood_limits
  using (
    (user_id is null)
    or (user_id = (select auth.uid()))
    or (exists (select 1 from profiles p where ((p.id = (select auth.uid())) and (p.is_admin is true))))
  );

alter policy post_flood_limits_insert_admin on public.post_flood_limits
  with check (
    exists (select 1 from profiles p where ((p.id = (select auth.uid())) and (p.is_admin is true)))
  );

alter policy post_flood_limits_update_admin on public.post_flood_limits
  using (
    exists (select 1 from profiles p where ((p.id = (select auth.uid())) and (p.is_admin is true)))
  )
  with check (
    exists (select 1 from profiles p where ((p.id = (select auth.uid())) and (p.is_admin is true)))
  );

alter policy post_flood_limits_delete_admin on public.post_flood_limits
  using (
    exists (select 1 from profiles p where ((p.id = (select auth.uid())) and (p.is_admin is true)))
  );

-- ── help_requests (Pedidos de ajuda) ──
alter policy help_requests_insert_authenticated on public.help_requests
  with check ((user_id is null) or (user_id = (select auth.uid())));

-- ── user_legal_acceptances (Privacidade) ──
alter policy user_legal_acceptances_select_own_or_admin on public.user_legal_acceptances
  using ((user_id = (select auth.uid())) or kc_is_admin((select auth.uid())));

alter policy user_legal_acceptances_insert_own on public.user_legal_acceptances
  with check (user_id = (select auth.uid()));

alter policy user_legal_acceptances_update_own_or_admin on public.user_legal_acceptances
  using ((user_id = (select auth.uid())) or kc_is_admin((select auth.uid())))
  with check ((user_id = (select auth.uid())) or kc_is_admin((select auth.uid())));

-- ── Índice duplicado em posts (idêntico a posts_author_id_created_at_idx) ──
drop index if exists public.idx_posts_author_created_desc;

commit;
