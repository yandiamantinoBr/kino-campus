-- ============================================================
-- KinoCampus — V8.4.3.1
-- Index Coverage: foreign keys sem índice (unindexed_foreign_keys)
--
-- Resolve os INFOs do Performance Advisor:
--   - hero_banner_audit: hero_banner_audit_banner_id_fkey  (coluna: banner_id)
--   - hero_banner_audit: hero_banner_audit_changed_by_fkey (coluna: changed_by)
--   - hero_banners:      hero_banners_created_by_fkey      (coluna: created_by)
--   - hero_banners:      hero_banners_updated_by_fkey      (coluna: updated_by)
--   - post_limits:       post_limits_created_by_fkey       (coluna: created_by)
--   - search_queries:    search_queries_user_id_fkey        (coluna: user_id)
--
-- FK sem índice causa full table scan no lado filho ao fazer JOIN reverso ou
-- ao verificar integridade referencial em DELETE/UPDATE na tabela pai (profiles).
-- ============================================================

begin;

-- hero_banner_audit
create index if not exists idx_hero_banner_audit_banner_id
  on public.hero_banner_audit (banner_id);

create index if not exists idx_hero_banner_audit_changed_by
  on public.hero_banner_audit (changed_by);

-- hero_banners
create index if not exists idx_hero_banners_created_by
  on public.hero_banners (created_by);

create index if not exists idx_hero_banners_updated_by
  on public.hero_banners (updated_by);

-- post_limits
create index if not exists idx_post_limits_created_by
  on public.post_limits (created_by);

-- search_queries (user_id já tem idx_search_queries_created_at; este cobre joins por usuário)
create index if not exists idx_search_queries_user_id
  on public.search_queries (user_id);

commit;
