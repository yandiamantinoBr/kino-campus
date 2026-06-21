-- ============================================================
-- KinoCampus — V8.4.3.0
-- RLS Performance Fix: auth_rls_initplan + multiple_permissive_policies
--
-- Resolve todos os WARNINGs do Performance Advisor do Supabase:
--
-- [auth_rls_initplan]
--   Substitui chamadas diretas a auth.uid() / kc_is_admin(auth.uid()) por
--   (select auth.uid()) para evitar re-avaliação por linha.
--   Afeta: reports, search_queries, hero_banners, hero_banner_audit,
--          help_requests, post_limits.
--
-- [multiple_permissive_policies]
--   Consolida pares de políticas permissivas para mesma role+action em
--   uma única política com condição OR, eliminando overhead de dupla avaliação.
--   Afeta: hero_banners (SELECT), post_limits (SELECT+ALL), posts (DELETE),
--          reports (INSERT), saved_posts (SELECT authenticated).
-- ============================================================

begin;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. public.reports
--    Problema: reports_insert_own usa auth.uid() direto (initplan)
--              reports_insert_authenticated + reports_insert_own são duplicatas (multiple permissive)
--    Solução:  Drop ambas, recria uma única com (select auth.uid())
-- ──────────────────────────────────────────────────────────────────────────────

drop policy if exists reports_insert_own           on public.reports;
drop policy if exists reports_insert_authenticated on public.reports;

create policy reports_insert_authenticated
  on public.reports for insert
  to authenticated
  with check ((select auth.uid()) = reporter_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. public.search_queries
--    Problema: search_queries_select_admin usa auth.uid() direto (initplan)
--    Solução:  Recria com (select auth.uid())
-- ──────────────────────────────────────────────────────────────────────────────

drop policy if exists search_queries_select_admin on public.search_queries;

create policy search_queries_select_admin
  on public.search_queries for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.is_admin = true
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. public.hero_banners
--    Problema: banners_read_active + banners_read_admin são múltiplas permissivas
--              banners_*_admin usam auth.uid() direto (initplan)
--    Solução:  Consolida SELECT em uma política; corrige auth.uid() em write policies
-- ──────────────────────────────────────────────────────────────────────────────

-- SELECT consolidado: banners ativos visíveis para todos + admins veem todos
drop policy if exists banners_read_active on public.hero_banners;
drop policy if exists banners_read_admin  on public.hero_banners;

create policy banners_read
  on public.hero_banners for select
  using (
    is_active = true
    or exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and is_admin = true
    )
  );

-- INSERT: corrige auth.uid() → (select auth.uid())
drop policy if exists banners_insert_admin on public.hero_banners;

create policy banners_insert_admin
  on public.hero_banners for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and is_admin = true
    )
  );

-- UPDATE: corrige auth.uid() → (select auth.uid())
drop policy if exists banners_update_admin on public.hero_banners;

create policy banners_update_admin
  on public.hero_banners for update
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and is_admin = true
    )
  );

-- DELETE: corrige auth.uid() → (select auth.uid())
drop policy if exists banners_delete_admin on public.hero_banners;

create policy banners_delete_admin
  on public.hero_banners for delete
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and is_admin = true
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. public.hero_banner_audit
--    Problema: banner_audit_read_admin usa auth.uid() direto (initplan)
--    Solução:  Recria com (select auth.uid())
-- ──────────────────────────────────────────────────────────────────────────────

drop policy if exists banner_audit_read_admin on public.hero_banner_audit;

create policy banner_audit_read_admin
  on public.hero_banner_audit for select
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and is_admin = true
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. public.help_requests
--    Problema: as 3 políticas usam auth.uid() direto / kc_is_admin(auth.uid()) (initplan)
--    Solução:  Recria com (select auth.uid()) / kc_is_admin((select auth.uid()))
-- ──────────────────────────────────────────────────────────────────────────────

drop policy if exists help_requests_insert_public on public.help_requests;
drop policy if exists help_requests_select_own    on public.help_requests;
drop policy if exists help_requests_update_admin  on public.help_requests;

create policy help_requests_insert_public
  on public.help_requests for insert
  to anon, authenticated
  with check (
    user_id is null
    or user_id = (select auth.uid())
  );

create policy help_requests_select_own
  on public.help_requests for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.kc_is_admin((select auth.uid()))
  );

create policy help_requests_update_admin
  on public.help_requests for update
  to authenticated
  using (public.kc_is_admin((select auth.uid())))
  with check (public.kc_is_admin((select auth.uid())));

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. public.post_limits
--    Problema: post_limits_admin_all (FOR ALL) + post_limits_select_self (FOR SELECT)
--              causam multiple_permissive_policies para authenticated SELECT.
--              Ambas usam auth.uid() direto (initplan).
--    Solução:  Drop ambas. Cria: SELECT unificado + políticas write separadas.
--              Usar FOR ALL gera novamente overlap de SELECT — logo usamos INSERT/UPDATE/DELETE.
-- ──────────────────────────────────────────────────────────────────────────────

drop policy if exists post_limits_admin_all   on public.post_limits;
drop policy if exists post_limits_select_self on public.post_limits;

-- SELECT único: usuário vê próprios limites, limites globais (user_id IS NULL) e, se admin, todos
create policy post_limits_select
  on public.post_limits for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or user_id is null
    or exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and is_admin = true
    )
  );

-- INSERT admin
create policy post_limits_insert_admin
  on public.post_limits for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and is_admin = true
    )
  );

-- UPDATE admin
create policy post_limits_update_admin
  on public.post_limits for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and is_admin = true
    )
  );

-- DELETE admin
create policy post_limits_delete_admin
  on public.post_limits for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and is_admin = true
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. public.posts (DELETE)
--    Problema: posts_delete_admin + posts_delete_own causam multiple_permissive_policies
--              para authenticated DELETE (regressão de v8.2.10.1 que dividiu v8.2.10.0).
--    Solução:  Re-consolida em uma única política (mantendo (select auth.uid()) IS NOT NULL
--              como guarda de segurança de v8.2.10.1).
-- ──────────────────────────────────────────────────────────────────────────────

drop policy if exists posts_delete_own          on public.posts;
drop policy if exists posts_delete_admin        on public.posts;
drop policy if exists posts_delete_authenticated on public.posts; -- idempotente

create policy posts_delete_authenticated
  on public.posts for delete
  to authenticated
  using (
    (select auth.uid()) is not null
    and (
      -- Autor deleta o próprio post (somente published/pending)
      (
        (select auth.uid()) = author_id
        and status in ('published', 'pending')
      )
      -- Admin deleta qualquer post
      or (
        select is_admin from public.profiles
        where id = (select auth.uid())
      ) = true
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 8. public.saved_posts (SELECT authenticated)
--    Problema: saved_posts_select_own + saved_posts_select_highlights_authenticated
--              causam multiple_permissive_policies para authenticated SELECT.
--    Solução:  Consolida em uma única política com condição OR.
-- ──────────────────────────────────────────────────────────────────────────────

drop policy if exists saved_posts_select_own                      on public.saved_posts;
drop policy if exists saved_posts_select_highlights_authenticated on public.saved_posts;

create policy saved_posts_select_authenticated
  on public.saved_posts for select
  to authenticated
  using (
    -- Usuário vê seus próprios salvos
    (select auth.uid()) = user_id
    -- Ou: destaque de post que o usuário autenticado tem permissão de ler
    or (
      kind = 'highlight'
      and exists (
        select 1 from public.posts p
        where p.id = saved_posts.post_id
          and public.kc_can_read_post(p.author_id, p.status, p.visibility)
      )
    )
  );

commit;
